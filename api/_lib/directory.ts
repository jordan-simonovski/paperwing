import type { FoundFeed } from '../../src/lib/publishers.js'
import { pdsOf, pool } from './frontpage.js'
import { fetchJson } from './http.js'
import { kv } from './kv.js'
import { blocked } from './paperwing.js'
import { hidden, publicationUri, selfLabels, standardPublication } from './standard.js'

// The open web's directory: blogs on atproto that publish with Standard.site, found by themselves.
// The relay lists every account holding a site.standard.publication record. Each scheduled run
// reads one page of that list, checks each publication against its own website (the same check as
// following one), and keeps those that posted lately. Nobody submits anything or approves it.

const RELAY = 'https://relay1.us-east.bsky.network'
const KEY = 'rd:directory'
const CURSOR = 'rd:directory:cursor'
const DID = /^did:(?:plc:[a-z2-7]{24}|web:[a-z0-9.%:-]+)$/
const DAY = 86_400_000
// ponytail: 200 accounts a run (about 30 seconds, measured at 14 per 100) inside push.ts's 60; ~15k accounts is a pass every ~12 hours at a run every 10 minutes. Raise the rate before the batch if a pass grows past a day.
const BATCH = 200
/** Not posted for this long: not one to suggest. */
const QUIET = 90 * DAY
/** Not found again for this long (deleted, no longer verified, gone quiet): dropped from the list. */
const STALE = 3 * DAY

interface Entry {
  url: string
  name: string
  /** When its newest post was published. */
  latest: number
  /** When a crawl last verified it. */
  seenAt: number
}

type Listed = { records?: { uri?: unknown; value?: unknown }[] }
const object = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined)
const records = (l: Listed) => (Array.isArray(l.records) ? l.records : [])
const parse = (raw: string): Entry | undefined => {
  try {
    return JSON.parse(raw) as Entry
  } catch {
    return undefined
  }
}

/** One account's publications that posted lately and that their own websites confirm. */
async function publicationsOf(did: string, now: number): Promise<[string, Entry][]> {
  const pds = await pdsOf(did)
  const list = (collection: string, limit: number) =>
    fetchJson<Listed>(`${pds}/xrpc/com.atproto.repo.listRecords?${new URLSearchParams({ repo: did, collection, limit: String(limit) })}`, { timeoutMs: 6000, maxBytes: 500_000 })
  const [pubs, docs] = await Promise.all([list('site.standard.publication', 10), list('site.standard.document', 25)])
  const out: [string, Entry][] = []
  for (const r of records(pubs).slice(0, 10)) {
    const uri = typeof r?.uri === 'string' ? r.uri : ''
    const value = object(r?.value)
    if (publicationUri.exec(uri)?.[1] !== did || typeof value?.url !== 'string' || hidden(selfLabels(value))) continue
    const site = value.url.replace(/\/$/, '')
    const latest = Math.max(
      0,
      ...records(docs).flatMap((d) => {
        const doc = object(d?.value)
        const at = typeof doc?.publishedAt === 'string' ? Date.parse(doc.publishedAt) : NaN
        const mine = doc?.site === uri || (typeof doc?.site === 'string' && doc.site.replace(/\/$/, '') === site)
        // A date in the future isn't a recent post.
        return mine && at <= now + 60_000 && !hidden(selfLabels(doc!)) ? [at] : []
      }),
    )
    // Only then ask the website: a quiet blog costs the crawl nothing more.
    if (latest < now - QUIET) continue
    const pub = await standardPublication(value.url, uri).catch(() => undefined)
    if (pub) out.push([uri, { url: pub.url, name: pub.name, latest, seenAt: now }])
  }
  return out
}

/** One scheduled step: the next page of the relay's list, checked and kept. At the end of a pass, it starts over. */
export async function crawlDirectory(now = Date.now()): Promise<{ checked: number; listed: number; done: boolean }> {
  const store = kv()
  const cursor = await store.get(CURSOR)
  const params = new URLSearchParams({ collection: 'site.standard.publication', limit: String(BATCH), ...(cursor ? { cursor } : {}) })
  const page = await fetchJson<{ repos?: { did?: unknown }[]; cursor?: unknown }>(`${RELAY}/xrpc/com.atproto.sync.listReposByCollection?${params}`, { timeoutMs: 8000 })
  const repos = Array.isArray(page.repos) ? page.repos.slice(0, BATCH) : []
  const off = blocked()
  const dids = repos.map((r) => r?.did).filter((d): d is string => typeof d === 'string' && DID.test(d) && !off.has(d))
  const found = (await pool(dids, 16, (did) => publicationsOf(did, now))).flatMap((f) => f ?? [])
  if (found.length)
    await store.hset(
      KEY,
      found.map(([uri, e]) => [uri, JSON.stringify(e)]),
    )
  const next = typeof page.cursor === 'string' && page.cursor.length < 500 && repos.length && page.cursor !== cursor ? page.cursor : undefined
  if (next) await store.set(CURSOR, next, 7 * 86_400)
  else {
    await store.del([CURSOR])
    // A pass is over: forget what it didn't find again.
    const old = Object.entries(await store.hgetall(KEY))
      .filter(([, raw]) => (parse(raw)?.seenAt ?? 0) < now - STALE)
      .map(([uri]) => uri)
    if (old.length) await store.hdel(KEY, old)
  }
  return { checked: dids.length, listed: found.length, done: !next }
}

/** The directory as the app shows it: newest post first, each ready to follow. */
export async function directory(now = Date.now()): Promise<FoundFeed[]> {
  const off = blocked()
  return Object.entries(await kv().hgetall(KEY))
    .flatMap(([uri, raw]) => {
      const e = parse(raw)
      return e && e.seenAt >= now - STALE && e.latest >= now - QUIET && !off.has(uri) && !off.has(uri.split('/')[2]) ? [e] : []
    })
    .sort((a, b) => b.latest - a.latest)
    .slice(0, 300)
    .map((e) => ({ url: e.url, title: e.name, site: new URL(e.url).hostname, posts: 0, latest: e.latest, format: 'standard' as const }))
}
