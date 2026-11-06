import type { FoundFeed } from '../../src/lib/publishers.js'
import { getRecord, pool } from './frontpage.js'
import { kv } from './kv.js'
import { blocked } from './paperwing.js'
import { hidden, object, publicationUri, selfLabels, standardPublication } from './standard.js'

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
const DAY = 86_400_000
/** Not posted for this long: not one to suggest, and forgotten. */
const QUIET = 90 * DAY
/** How long a website's confirmation lasts before the next post checks it again. */
const RECHECK = 7 * DAY
/** How long a site that didn't confirm (or couldn't be reached) waits to be asked again. */
const RETRY = DAY
// ponytail: an hour of Standard.site posts is ~4k events from ~100 authors, and 100 checks take ~18s (measured). A check can take ~25s or more at worst (four requests in a row, author-chosen hosts), so the run stops waiting at 45s and saves what it has, well inside push.ts's 60 seconds. A busier hour carries on from the cursor next run, and authors past the caps wait for their next post.
const READ_FOR = 20_000
const RUN_FOR = 45_000
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
  const runEnd = Date.now() + RUN_FOR
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
    if (typeof did !== 'string' || off.has(did) || typeof record.site !== 'string' || hidden(selfLabels(record))) continue
    // A date in the future isn't a recent post.
    if (!(at <= now + 60_000) || at < now - QUIET) continue
    // ponytail: only posts in a publication count (loose ones naming a plain site were 325 of 330 failed checks, measured), and a post only vouches for its own author's publication.
    if (publicationUri.exec(record.site)?.[1] !== did) continue
    posts++
    posted.set(record.site, Math.max(posted.get(record.site) ?? 0, at))
  }
  const [known, failed] = await Promise.all([store.hgetall(KEY), store.hgetall(FAILED)])
  const updates = new Map<string, Entry>()
  const toCheck: [string, number][] = []
  // One publication per account a run, so nobody can take every check by posting to many.
  const authors = new Set<string>()
  for (const [uri, latest] of posted) {
    const entry = known[uri] ? parse(known[uri]) : undefined
    const author = uri.split('/')[2]
    // A listed one is re-dated either way; if it's due a check that refuses it, it leaves the list below.
    if (entry) updates.set(uri, { ...entry, latest: Math.max(entry.latest, latest) })
    if (entry && now - entry.checkedAt < RECHECK) continue
    if (!(now - Number(failed[uri]) < RETRY) && !authors.has(author)) {
      authors.add(author)
      toCheck.push([uri, latest])
    }
  }
  const checks = toCheck.slice(0, MAX_CHECKS)
  // Checks still running at the deadline are left for their authors' next posts (neither failed nor
  // unlisted), and none start after it: the run always gets to save what it found.
  const results: ([string, Entry] | 'refused' | 'late')[] = checks.map(() => 'late')
  let asked = 0
  const work = pool(
    checks.map((c, i) => [c, i] as const),
    16,
    async ([[uri, latest], i]) => {
      if (Date.now() >= runEnd) return
      asked++
      results[i] = (await confirm(uri, latest, now).catch(() => undefined)) ?? 'refused'
    },
  )
  let timer: ReturnType<typeof setInterval> | undefined
  await Promise.race([work, new Promise<void>((resolve) => (timer = setInterval(() => Date.now() >= runEnd && resolve(), 250)))])
  clearInterval(timer)
  const refused = new Set<string>()
  results.forEach((r, i) => {
    if (Array.isArray(r)) updates.set(r[0], { ...r[1], latest: Math.max(r[1].latest, updates.get(r[0])?.latest ?? 0) })
    else if (r === 'refused') refused.add(checks[i][0])
  })
  if (refused.size)
    await store.hset(
      FAILED,
      [...refused].map((uri) => [uri, String(now)]),
    )
  // A listed publication its website no longer confirms, that's now labelled adult or hidden, or whose
  // server couldn't be reached on its re-check leaves the list until a later post confirms it again.
  const unlisted = [...refused].filter((uri) => known[uri])
  const retry = Object.keys(failed).filter((uri) => !refused.has(uri) && !(now - Number(failed[uri]) < RETRY))
  if (retry.length) await store.hdel(FAILED, retry)
  if (updates.size)
    await store.hset(
      KEY,
      [...updates].map(([uri, e]) => [uri, JSON.stringify(e)]),
    )
  const quiet = Object.entries(known)
    .filter(([uri, raw]) => !updates.has(uri) && (parse(raw)?.latest ?? 0) < now - QUIET)
    .map(([uri]) => uri)
  if (quiet.length || unlisted.length) await store.hdel(KEY, [...new Set([...quiet, ...unlisted])])
  // Only once what the run found is saved: a run that fails partway reads the same posts again.
  if (last) await store.set(CURSOR, String(last), 7 * 86_400)
  return { posts, checked: asked, listed: updates.size - [...refused].filter((uri) => updates.has(uri)).length }
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
