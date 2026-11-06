import type { DirectoryFeed } from '../../src/lib/publishers.js'
import { BSKY_PATHS } from './atlinks.js'
import { getRecord, pool } from './frontpage.js'
import { fetchJson } from './http.js'
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
// ponytail: an hour of Standard.site posts is ~4k events from ~100 authors, and 100 checks take ~18s (measured). A check can take ~25s or more at worst (four requests in a row, author-chosen hosts), so the run stops waiting at 45s and saves what it has in three rounds of KV writes, inside push.ts's 60 seconds while the store is healthy (a slow store fails safe: the cursor is saved last). A busier hour carries on from the cursor next run, and authors past the caps wait for their next post.
const READ_FOR = 20_000
const RUN_FOR = 45_000
const MAX_CHECKS = 60
const APPVIEW = 'https://public.api.bsky.app'
const CONSTELLATION = 'https://constellation.microcosm.blue'
/** Accounts never listed, beyond the adult and hidden labels: ones that asked not to be shown to logged-out viewers, and automated ones. */
const UNLISTED = ['!no-unauthenticated', 'bot', '!automation']
// ponytail: thresholds from the first day's 211 listed blogs (measured): under 10 followers was mostly
// empty or auto-generated feeds, and more than a dozen freshly dated posts a day was feeds, not blogs.
const MIN_FOLLOWERS = 10
const FEED_PER_DAY = 12

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
  /** Its newest post's path, for counting who discusses it. */
  post?: string
  /** What the last check found: the author's Bluesky followers, who lists it in a blogroll, and how many discuss its newest post. */
  followers?: number
  listedBy?: string[]
  discussed?: number
  /** When its posts of the last day were published: a feed, not a blog, past FEED_PER_DAY. */
  recent?: number[]
}

/** What a run saw of one publication. */
interface Seen {
  latest: number
  post?: string
  fresh: number[]
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

type Links = Record<string, Record<string, { distinct_dids?: number }>>
/** Every kind of record linking to a URL, counted (Constellation). A signal, so a failure counts as none. */
const linksTo = (target: string) =>
  fetchJson<{ links?: Links }>(`${CONSTELLATION}/links/all?target=${encodeURIComponent(target)}`, { timeoutMs: 6000 })
    .then((r) => (object(r.links) as Links | undefined) ?? {})
    .catch((): Links => ({}))
const count = (links: Links, collection: string, path: (p: string) => boolean) =>
  Math.max(
    0,
    ...Object.entries(object(links[collection]) ?? {}).flatMap(([p, c]) => {
      const n = object(c)?.distinct_dids
      return path(p) && typeof n === 'number' ? [n] : []
    }),
  )

/** Recent post times, the ones from this run added once each, the day's only. */
const freshen = (recent: number[] = [], fresh: number[], now: number) =>
  [...new Set([...recent, ...fresh])]
    .filter((t) => t > now - DAY)
    .sort((a, b) => a - b)
    .slice(-50)

/**
 * The publication a post names, confirmed by its own website, with what says whether it's worth
 * suggesting: an author account that isn't labelled, automated or brand new, who lists it, and how
 * many discuss its newest post.
 */
async function confirm(uri: string, seen: Seen, now: number): Promise<[string, Entry] | undefined> {
  const value = object((await getRecord<unknown>(uri)).value)
  if (typeof value?.url !== 'string' || hidden(selfLabels(value))) return undefined
  const pub = await standardPublication(value.url, uri)
  const did = uri.split('/')[2]
  const [profile, home, newest] = await Promise.all([
    fetchJson<{ followersCount?: unknown; labels?: unknown[] }>(`${APPVIEW}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`, { timeoutMs: 6000 }),
    linksTo(pub.url),
    seen.post ? linksTo(`${pub.url}${seen.post}`) : Promise.resolve<Links>({}),
  ])
  const labels = (Array.isArray(profile.labels) ? profile.labels : []).flatMap((l) => (typeof object(l)?.val === 'string' ? [object(l)!.val as string] : []))
  const followers = typeof profile.followersCount === 'number' ? profile.followersCount : 0
  if (hidden(labels) || labels.some((l) => UNLISTED.includes(l)) || followers < MIN_FOLLOWERS) return undefined
  const blogrolls = count(home, 'io.paperwing.blogroll', (p) => p === '.feeds[].url')
  const listedBy = blogrolls
    ? await fetchJson<{ linking_dids?: unknown[] }>(
        `${CONSTELLATION}/links/distinct-dids?target=${encodeURIComponent(pub.url)}&collection=io.paperwing.blogroll&path=${encodeURIComponent('.feeds[].url')}&limit=20`,
        { timeoutMs: 6000 },
      )
        .then((r) =>
          Array.isArray(r.linking_dids) ? r.linking_dids.filter((d): d is string => typeof d === 'string' && publicationUri.test(`at://${d}/site.standard.publication/x`)).slice(0, 20) : [],
        )
        .catch(() => [])
    : []
  const discussed = count(newest, 'app.bsky.feed.post', (p) => BSKY_PATHS.test(p))
  return [uri, { url: pub.url, name: pub.name, latest: seen.latest, checkedAt: now, post: seen.post, followers, listedBy, discussed, recent: freshen([], seen.fresh, now) }]
}

/** One scheduled run: the posts since the last run, their publications checked or re-dated, quiet ones forgotten. */
export async function crawlDirectory(now = Date.now(), source: PostSource = jetstream): Promise<{ posts: number; checked: number; listed: number }> {
  const store = kv()
  const runEnd = Date.now() + RUN_FOR
  // The first run looks back a day, which fills the directory without a separate backfill.
  const cursor = Number(await store.get(CURSOR)) || (now - DAY) * 1000
  const off = blocked()
  // Each publication's newest post this run, and the new posts it published today.
  const posted = new Map<string, Seen>()
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
    const seen = posted.get(record.site) ?? { latest: 0, fresh: [] }
    const path = typeof record.path === 'string' && record.path.startsWith('/') && record.path.length <= 500 ? record.path : undefined
    if (at > seen.latest) Object.assign(seen, { latest: at, post: path ?? seen.post })
    // A new post dated today (an imported archive is dated when it was written).
    if (op === 'create' && at > now - DAY) seen.fresh.push(at)
    posted.set(record.site, seen)
  }
  const [known, failed] = await Promise.all([store.hgetall(KEY), store.hgetall(FAILED)])
  const updates = new Map<string, Entry>()
  const toCheck: [string, Seen][] = []
  // One publication per account a run, so nobody can take every check by posting to many.
  const authors = new Set<string>()
  for (const [uri, seen] of posted) {
    const entry = known[uri] ? parse(known[uri]) : undefined
    const author = uri.split('/')[2]
    // Confirmed this week: just re-dated. One due a check is re-dated only if the check confirms it, so a
    // server too slow to answer can't keep a publication listed and current without ever being re-checked.
    if (entry && now - entry.checkedAt < RECHECK) {
      updates.set(uri, { ...entry, ...(seen.latest > entry.latest ? { latest: seen.latest, post: seen.post ?? entry.post } : {}), recent: freshen(entry.recent, seen.fresh, now) })
      continue
    }
    if (!(now - Number(failed[uri]) < RETRY) && !authors.has(author)) {
      authors.add(author)
      toCheck.push([uri, seen])
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
    async ([[uri, seen], i]) => {
      if (Date.now() >= runEnd) return
      asked++
      results[i] = (await confirm(uri, seen, now).catch(() => undefined)) ?? 'refused'
    },
  )
  let timer: ReturnType<typeof setInterval> | undefined
  await Promise.race([work, new Promise<void>((resolve) => (timer = setInterval(() => Date.now() >= runEnd && resolve(), 250)))])
  clearInterval(timer)
  const refused = new Set<string>()
  results.forEach((r, i) => {
    if (Array.isArray(r)) {
      const before = known[r[0]] ? parse(known[r[0]]) : undefined
      updates.set(r[0], { ...r[1], latest: Math.max(r[1].latest, before?.latest ?? 0), recent: freshen(before?.recent, r[1].recent ?? [], now) })
    } else if (r === 'refused') refused.add(checks[i][0])
  })
  // A listed publication its website no longer confirms, that's now labelled adult or hidden, or whose
  // server couldn't be reached on its re-check leaves the list until a later post confirms it again.
  const unlisted = [...refused].filter((uri) => known[uri])
  const retry = Object.keys(failed).filter((uri) => !refused.has(uri) && !(now - Number(failed[uri]) < RETRY))
  const quiet = Object.entries(known)
    .filter(([uri, raw]) => !updates.has(uri) && (parse(raw)?.latest ?? 0) < now - QUIET)
    .map(([uri]) => uri)
  const gone = [...new Set([...quiet, ...unlisted])]
  // Two independent chains, so a slow store costs two rounds here rather than four.
  await Promise.all([
    (async () => {
      if (refused.size)
        await store.hset(
          FAILED,
          [...refused].map((uri) => [uri, String(now)]),
        )
      if (retry.length) await store.hdel(FAILED, retry)
    })(),
    (async () => {
      if (updates.size)
        await store.hset(
          KEY,
          [...updates].map(([uri, e]) => [uri, JSON.stringify(e)]),
        )
      if (gone.length) await store.hdel(KEY, gone)
    })(),
  ])
  // Only once what the run found is saved: a run that fails partway reads the same posts again.
  if (last) await store.set(CURSOR, String(last), 7 * 86_400)
  return { posts, checked: asked, listed: updates.size }
}

// ponytail: each point of signal buys two hours of freshness: log2 of the author's followers, three a
// blogroll listing, two a person discussing the newest post (up to ten). Tune the weights here.
const credit = (e: Entry) => 2 * HOUR * (Math.log2(1 + (e.followers ?? 0)) + 3 * (e.listedBy?.length ?? 0) + 2 * Math.min(e.discussed ?? 0, 10))
const HOUR = 3_600_000

/** The directory as the app shows it, each ready to follow: recent posts first, with credit for being read, listed and discussed. */
export async function directory(now = Date.now()): Promise<DirectoryFeed[]> {
  const off = blocked()
  return Object.entries(await kv().hgetall(KEY))
    .flatMap(([uri, raw]) => {
      const e = parse(raw)
      const feed = (e?.recent ?? []).filter((t) => t > now - DAY).length > FEED_PER_DAY
      return e && !feed && e.latest >= now - QUIET && !off.has(uri) && !off.has(uri.split('/')[2]) ? [{ e, author: uri.split('/')[2] }] : []
    })
    .sort((a, b) => b.e.latest + credit(b.e) - (a.e.latest + credit(a.e)))
    .slice(0, 300)
    .map(({ e, author }) => ({
      url: e.url,
      title: e.name,
      site: new URL(e.url).hostname,
      posts: 0,
      latest: e.latest,
      format: 'standard' as const,
      author,
      ...(e.listedBy?.length ? { listedBy: e.listedBy } : {}),
    }))
}
