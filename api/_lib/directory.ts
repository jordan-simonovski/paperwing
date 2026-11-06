import type { FoundFeed } from '../../src/lib/publishers.js'
import { getRecord, pool } from './frontpage.js'
import { kv } from './kv.js'
import { blocked } from './paperwing.js'
import { hidden, publicationUri, selfLabels, standardPublication } from './standard.js'

// The open web's directory: blogs on atproto that publish with Standard.site, found by themselves.
// Each hourly run replays the Standard.site posts published since the last one from Jetstream
// (Bluesky's public, filtered event stream). A publication someone just posted to is checked
// against its own website, the same check as following one, then kept with its newest post's date.
// One confirmed this week is only re-dated, from the event itself, without asking anyone.
// Nobody submits anything or approves it.

const JETSTREAM = 'wss://jetstream2.us-east.bsky.network'
const KEY = 'rd:directory'
const CURSOR = 'rd:directory:cursor'
/** Author and site pairs whose website didn't confirm them, and when it was asked. */
const FAILED = 'rd:directory:failed'
const DID = /^did:(?:plc:[a-z2-7]{24}|web:[a-z0-9.%:-]+)$/
const DAY = 86_400_000
/** Not posted for this long: not one to suggest, and forgotten. */
const QUIET = 90 * DAY
/** How long a website's confirmation lasts before the next post checks it again. */
const RECHECK = 7 * DAY
/** How long a site that didn't confirm (or couldn't be reached) waits to be asked again. */
const RETRY = DAY
// ponytail: an hour of Standard.site posts is ~4k events from ~100 authors, and 100 checks take ~18s (measured). The caps keep a run near 30 of push.ts's 60 seconds; a busier hour carries on from the cursor next run, and authors past the check cap wait for their next post.
const READ_FOR = 20_000
const MAX_CHECKS = 60

/** One event from Jetstream, as sent: nothing in it is trusted. */
export interface Posted {
  did?: unknown
  time_us?: unknown
  kind?: unknown
  commit?: { operation?: unknown; collection?: unknown; record?: unknown }
}

/** Standard.site document writes from `cursor` (microseconds), until caught up with now or past `deadline`. */
export type PostSource = (cursor: number, deadline: number) => AsyncIterable<Posted>

interface Entry {
  url: string
  name: string
  /** When its newest post was published. */
  latest: number
  /** When its website last confirmed it. */
  checkedAt: number
}

const object = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined)
const parse = (raw: string): Entry | undefined => {
  try {
    return JSON.parse(raw) as Entry
  } catch {
    return undefined
  }
}

/** Jetstream's replay over a WebSocket: it ends when it reaches the present, goes quiet, closes or runs out of time. */
const jetstream: PostSource = async function* (cursor, deadline) {
  const ws = new WebSocket(`${JETSTREAM}/subscribe?wantedCollections=site.standard.document&cursor=${cursor}`)
  const queue: Posted[] = []
  let closed = false
  let heard = Date.now()
  let wake = () => {}
  ws.onmessage = (e) => {
    heard = Date.now()
    try {
      queue.push(JSON.parse(String(e.data)) as Posted)
    } catch {
      /* not JSON: skipped */
    }
    wake()
  }
  ws.onclose = ws.onerror = () => {
    closed = true
    wake()
  }
  try {
    while (Date.now() < deadline) {
      const next = queue.shift()
      if (next) {
        yield next
        if (typeof next.time_us === 'number' && next.time_us > (Date.now() - 10_000) * 1000) return
        continue
      }
      if (closed || Date.now() - heard > 5000) return
      await new Promise<void>((resolve) => {
        wake = resolve
        setTimeout(resolve, 1000)
      })
    }
  } finally {
    ws.close()
  }
}

/** The publication a post names, confirmed by its own website. */
async function confirm(uri: string, latest: number, now: number): Promise<[string, Entry] | undefined> {
  const value = object((await getRecord<unknown>(uri)).value)
  if (typeof value?.url !== 'string' || hidden(selfLabels(value))) return undefined
  const pub = await standardPublication(value.url, uri)
  return [uri, { url: pub.url, name: pub.name, latest, checkedAt: now }]
}

/** One scheduled run: the posts since the last run, their publications checked or re-dated, quiet ones forgotten. */
export async function crawlDirectory(now = Date.now(), source: PostSource = jetstream): Promise<{ posts: number; checked: number; listed: number }> {
  const store = kv()
  // The first run looks back a day, which fills the directory without a separate backfill.
  const cursor = Number(await store.get(CURSOR)) || (now - DAY) * 1000
  const off = blocked()
  // Each publication's newest post, this run.
  const posted = new Map<string, number>()
  let last = 0
  let posts = 0
  for await (const ev of source(cursor, Date.now() + READ_FOR)) {
    if (typeof ev.time_us === 'number') last = Math.max(last, ev.time_us)
    const record = object(ev.commit?.record)
    const op = ev.commit?.operation
    if (ev.kind !== 'commit' || ev.commit?.collection !== 'site.standard.document' || (op !== 'create' && op !== 'update') || !record) continue
    const did = ev.did
    const at = typeof record.publishedAt === 'string' ? Date.parse(record.publishedAt) : NaN
    if (typeof did !== 'string' || !DID.test(did) || off.has(did) || typeof record.site !== 'string' || hidden(selfLabels(record))) continue
    // A date in the future isn't a recent post.
    if (!(at <= now + 60_000) || at < now - QUIET) continue
    // ponytail: only posts in a publication count (loose ones naming a plain site were 325 of 330 failed checks, measured), and a post only vouches for its own author's publication.
    if (publicationUri.exec(record.site)?.[1] !== did) continue
    posts++
    posted.set(record.site, Math.max(posted.get(record.site) ?? 0, at))
  }
  if (last) await store.set(CURSOR, String(last), 7 * 86_400)

  const [known, failed] = await Promise.all([store.hgetall(KEY), store.hgetall(FAILED)])
  const updates = new Map<string, Entry>()
  const toCheck: [string, number][] = []
  for (const [uri, latest] of posted) {
    const entry = known[uri] ? parse(known[uri]) : undefined
    if (entry && now - entry.checkedAt < RECHECK) updates.set(uri, { ...entry, latest: Math.max(entry.latest, latest) })
    else if (!(now - Number(failed[uri]) < RETRY)) toCheck.push([uri, latest])
  }
  const checks = toCheck.slice(0, MAX_CHECKS)
  const results = await pool(checks, 16, ([uri, latest]) => confirm(uri, latest, now))
  for (const r of results) if (r) updates.set(r[0], { ...r[1], latest: Math.max(r[1].latest, (known[r[0]] && parse(known[r[0]])?.latest) || 0) })
  const refused = checks.filter((_, i) => !results[i]).map(([uri]) => uri)
  if (refused.length)
    await store.hset(
      FAILED,
      refused.map((uri) => [uri, String(now)]),
    )
  const retry = Object.keys(failed).filter((uri) => !(now - Number(failed[uri]) < RETRY))
  if (retry.length) await store.hdel(FAILED, retry)
  if (updates.size)
    await store.hset(
      KEY,
      [...updates].map(([uri, e]) => [uri, JSON.stringify(e)]),
    )

  const quiet = Object.entries(known)
    .filter(([uri, raw]) => !updates.has(uri) && (parse(raw)?.latest ?? 0) < now - QUIET)
    .map(([uri]) => uri)
  if (quiet.length) await store.hdel(KEY, quiet)
  return { posts, checked: checks.length, listed: updates.size }
}

/** The directory as the app shows it: newest post first, each ready to follow. */
export async function directory(now = Date.now()): Promise<FoundFeed[]> {
  const off = blocked()
  return Object.entries(await kv().hgetall(KEY))
    .flatMap(([uri, raw]) => {
      const e = parse(raw)
      return e && e.latest >= now - QUIET && !off.has(uri) && !off.has(uri.split('/')[2]) ? [e] : []
    })
    .sort((a, b) => b.latest - a.latest)
    .slice(0, 300)
    .map((e) => ({ url: e.url, title: e.name, site: new URL(e.url).hostname, posts: 0, latest: e.latest, format: 'standard' as const }))
}
