import { createHash } from 'node:crypto'
import { clientKey, fail, json, linkKey, readJson, today } from './_lib/http.js'
import { kv, kvConfigured, overLimit } from './_lib/kv.js'
import { pageTitle } from './_lib/og.js'
import { seal } from '../src/lib/syncCrypto.js'

// Sync between a person's devices, keyed by a secret code the devices share (never accounts).
// Each record is last-writer-wins on the client's updatedAt; the change feed is ordered by
// server time, so devices with skewed clocks still see every change.

interface SyncRecord {
  key: string
  updatedAt: number
  deleted?: boolean
  data?: unknown
}

// Records arrive encrypted (src/lib/syncCrypto.ts); this only ever sees ciphertext under opaque
// keys, except for links the inbox saves, which it seals with the code before storing.
const CODE = /^[a-z2-7]{26}$/
const MAX_CHANGES = 500
// Encryption and its base64 add about a third to a record. Keys arrive sealed, so this can't tell
// your settings (one record holding every list you keep, a few hundred feeds from an OPML import
// included) from a saved story: one limit fits both. The daily allowance bounds what anyone stores.
const MAX_RECORD = 64_000
const PAGE = 500
const TTL = 400 * 86_400
// What one caller (an address, or an IPv6 /64) may store in a day, in KB: a whole library's first
// upload fits many times over, but nobody can fill the store everyone's sync shares.
const WRITE_KB_PER_DAY = 100_000
const INBOX_PER_DAY = 200

/** Counts a write against the caller's daily allowance; false once it's spent (or can't be counted). */
async function allowWrite(request: Request, kb: number): Promise<boolean> {
  return !(await overLimit(`rd:sync-write:${clientKey(request)}:${today()}`, 86_400, WRITE_KB_PER_DAY, Math.max(1, Math.ceil(kb))))
}

const space = (code: string) => `rd:${createHash('sha256').update(code).digest('hex').slice(0, 40)}`

export async function GET(request: Request): Promise<Response> {
  if (new URL(request.url).searchParams.has('status')) return json({ enabled: kvConfigured() }, 300)
  return fail('POST changes to sync', 405)
}

/**
 * POST /api/sync?inbox: save a link to your queue from anywhere, with your sync code and no app
 * open. It's how the iOS share sheet saves to PaperWing (an Apple Shortcut posts here): your devices
 * pull it in on their next sync and fetch the article then. JSON `{ code, url, title? }`; the url
 * and title can also come as query parameters, but the code can't, so it never lands in a log.
 */
async function inbox(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams
  // The url and title can come as query parameters instead of a body.
  const body = (await readJson<{ code?: string; url?: string; title?: string }>(request)) ?? {}
  // Not from the query string: addresses end up in request logs.
  const code = String(body.code ?? request.headers.get('x-sync-code') ?? '')
    .toLowerCase()
    .replace(/[^a-z2-7]/g, '')
  // Shortcuts hand over the shared item as text, which can carry a title before the link.
  const url = String(body.url ?? q.get('url') ?? '').match(/https?:\/\/\S+/)?.[0]
  if (!CODE.test(code)) return fail('Bad sync code. Copy it again from Settings, Sync', 400)
  if (!url) return fail('No link to save', 400)
  if (await overLimit(`rd:sync-inbox:${clientKey(request)}:${today()}`, 86_400, INBOX_PER_DAY)) return fail('Too many saves from here today', 429)
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return fail('That link is not a URL', 400)
  }
  const host = parsed.hostname.replace(/^www\./, '')
  const title = String(body.title ?? q.get('title') ?? '').trim() || (await pageTitle(url).catch(() => undefined)) || host
  const now = Date.now()
  const key = linkKey(url)
  // The same shape a device writes when it saves a link: SavedItem without the article, which the
  // devices fetch when the record arrives.
  const plain: SyncRecord = {
    key: `s:${key}`,
    updatedAt: now,
    data: {
      story: { key, source: 'rss', sourceLabel: host, title: title.slice(0, 300), url, discussionUrl: null, createdAt: now, hasThread: false },
      savedAt: now,
      state: 'queue',
      seen: [],
      updatedAt: now,
    },
  }
  const record = await seal(code, plain)
  const store = kv()
  const base = space(code)
  await store.hset(`${base}:rec`, [[record.key, JSON.stringify(record)]])
  await store.zadd(`${base}:rev`, [[now, record.key]])
  await store.expire([`${base}:rec`, `${base}:rev`], TTL)
  return json({ ok: true, title }, 0)
}

export async function POST(request: Request): Promise<Response> {
  if (!kvConfigured()) return fail('Sync is not set up on this deployment', 501)
  if (new URL(request.url).searchParams.has('inbox')) return inbox(request)
  const code = request.headers.get('x-sync-code') ?? ''
  if (!CODE.test(code)) return fail('Bad sync code', 400)
  // `exact` is set on follow-up pages, which must not re-read the overlap or they'd never advance.
  const body = await readJson<{ since?: number; exact?: boolean; changes?: SyncRecord[] }>(request)
  if (!body) return fail('Body must be JSON')
  if (body.changes !== undefined && !Array.isArray(body.changes)) return fail('changes must be a list')
  const changes = (body.changes ?? []).filter((c) => typeof c?.key === 'string' && c.key.length < 600 && Number.isFinite(c.updatedAt))
  if (changes.length > MAX_CHANGES) return fail(`At most ${MAX_CHANGES} changes per request`)

  const store = kv()
  const base = space(code)
  const recKey = `${base}:rec`
  const revKey = `${base}:rev`
  try {
    // Keep a change only if it's newer than what the server holds.
    const existing = await store.hmget(
      recKey,
      changes.map((c) => c.key),
    )
    const now = Date.now()
    const accepted: SyncRecord[] = []
    // Named back to the device, so it can say what didn't sync rather than think everything did.
    const tooLarge: string[] = []
    changes.forEach((c, i) => {
      const held = existing[i] ? (JSON.parse(existing[i]!) as SyncRecord) : undefined
      if (held && held.updatedAt > c.updatedAt) return
      const record: SyncRecord = { key: c.key, updatedAt: c.updatedAt, ...(c.deleted ? { deleted: true } : { data: c.data }) }
      if (JSON.stringify(record).length <= MAX_RECORD) accepted.push(record)
      else tooLarge.push(c.key)
    })
    if (accepted.length) {
      const kb = accepted.reduce((n, r) => n + JSON.stringify(r).length, 0) / 1000
      if (!(await allowWrite(request, kb))) return fail('Too much synced from here today. Try again tomorrow.', 429)
      await store.hset(
        recKey,
        accepted.map((r) => [r.key, JSON.stringify(r)]),
      )
      // Fractions keep each write's position unique within the same millisecond.
      await store.zadd(
        revKey,
        accepted.map((r, i) => [now + i / 1000, r.key]),
      )
      await store.expire([recKey, revKey], TTL)
    }

    // A write stamped just before ours can land just after our read; re-reading the last few
    // seconds catches it. Repeats are harmless, since a record that isn't newer changes nothing.
    const since = Number(body.since) || 0
    const changed = await store.zrangeAbove(revKey, body.exact ? since : Math.max(0, since - 10_000), PAGE)
    const mine = new Set(accepted.map((r) => r.key))
    const theirs = changed.filter(([k]) => !mine.has(k))
    const values = await store.hmget(
      recKey,
      theirs.map(([k]) => k),
    )
    return json(
      {
        records: values.filter(Boolean).map((v) => JSON.parse(v!) as SyncRecord),
        cursor: changed.length ? Math.max(since, changed[changed.length - 1][1]) : since,
        more: changed.length === PAGE,
        accepted: accepted.length,
        tooLarge,
      },
      0,
    )
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'sync failed', 502)
  }
}
