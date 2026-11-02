import { createECDH, createHash, timingSafeEqual } from 'node:crypto'
import webpush from 'web-push'
import { emptyState, incidentSource, planAlerts, pushPayload, type AlertPrefs, type Notice, type SubRecord, type World } from './_lib/alerts.js'
import { clientKey, fail, json, readJson } from './_lib/http.js'
import { kv, kvConfigured, overLimit } from './_lib/kv.js'
import { outageReport } from './_lib/outageScan.js'
import { ensureSchedules, publicOrigin, qstashConfigured, scheduleSignature, verifyQStash } from './_lib/qstash.js'
import { STATUS_PAGES, statusIncidents } from './_lib/statuspages.js'
import { commentCounts } from './_lib/threadCounts.js'

// Notifications. Subscriptions, with what each device wants to hear about, live in the sync store.
//   GET  /api/push?key            whether push is set up, the public key, when alerts last ran
//   GET  /api/push?task=edition   the daily edition
//   GET  /api/push?task=alerts    replies, incidents and outage spikes, every five minutes
// Both runs come from Upstash QStash schedules PaperWing creates itself (api/_lib/qstash.ts), signed
// by QStash; CRON_SECRET as a bearer token works too, for any other scheduler.
//   POST /api/push                { subscription, alerts } to register, { remove }, { seen } when the app opens,
//                                 or { test } to send this device a test notification

const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:readout@example.com'
const SUBS = 'rd:push:subs'
const ALERTS_AT = 'rd:push:alerts-at'
const SCHEDULED_AT = 'rd:push:scheduled-at'
const VAPID = 'rd:push:vapid'

/** Push needs somewhere to keep subscriptions: the Upstash database from the Vercel integration. */
const configured = () => kvConfigured()

let keys: Promise<{ publicKey: string; privateKey: string }> | undefined
/**
 * The key pair push messages are signed with. VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY win when set;
 * otherwise PaperWing makes a pair the first time it's needed and keeps it in the database, so push
 * works with no setup. The pair must never change: every subscription is tied to it.
 */
function vapidKeys() {
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv } = process.env
  if (pub && priv) return Promise.resolve({ publicKey: pub, privateKey: priv })
  keys ??= (async () => {
    const store = kv()
    const held = await store.get(VAPID)
    if (held) return JSON.parse(held) as { publicKey: string; privateKey: string }
    // Two first requests at once both generate; only one pair is kept, and both read it back.
    await store.setOnce(VAPID, JSON.stringify(webpush.generateVAPIDKeys()))
    return JSON.parse((await store.get(VAPID))!) as { publicKey: string; privateKey: string }
  })().catch((err) => {
    keys = undefined
    throw err
  })
  return keys
}
const id = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex').slice(0, 32)

/**
 * The push services browsers actually use. Anything else would let a stranger register any HTTPS
 * address and have this server post to it (or hang on it) every time alerts run.
 */
const PUSH_HOSTS = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/
const pushHost = (endpoint: string) => {
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname)
  } catch {
    return false
  }
}
/** Every device that turned on alerts, few enough that one alert run reads and sends to them all in time. */
const MAX_SUBS = 2000
/** A push service that never answers must not hold up the whole run. */
const SEND_TIMEOUT = 5000

const sameSecret = (given: string | null, secret: string) => {
  const a = Buffer.from(given ?? '')
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The day's top Hacker News headline, so the notification says something real. */
async function leadHeadline(): Promise<string | undefined> {
  try {
    const res = await fetch('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=1', { signal: AbortSignal.timeout(5000) })
    const data = (await res.json()) as { hits: { title: string }[] }
    return data.hits[0]?.title
  } catch {
    return undefined
  }
}

const parse = (raw: string): SubRecord | undefined => {
  try {
    return JSON.parse(raw) as SubRecord
  } catch {
    return undefined
  }
}

/** A subscription's keys as browsers make them: a 65-byte P-256 public key and a 16-byte secret. */
export function validKeys(keys: { p256dh?: unknown; auth?: unknown } | undefined): boolean {
  const bytes = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]+={0,2}$/.test(v) ? Buffer.from(v, 'base64url') : undefined)
  const pub = bytes(keys?.p256dh)
  if (pub?.length !== 65 || bytes(keys?.auth)?.length !== 16) return false
  // The right length isn't enough: it has to be a point on the curve, or nothing can be sent to it.
  try {
    const ecdh = createECDH('prime256v1')
    ecdh.generateKeys()
    ecdh.computeSecret(pub)
    return true
  } catch {
    return false
  }
}

/**
 * Sends to one device; false when the subscription should be forgotten: the browser dropped it
 * (404, 410), the push service refuses it outright (400, 403), or it can't be encrypted for at all.
 */
async function send(sub: SubRecord, payload: string, ttl: number): Promise<boolean> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: ttl, urgency: 'normal', timeout: SEND_TIMEOUT })
    return true
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === undefined) return validKeys(sub.keys)
    return ![400, 403, 404, 410].includes(status)
  }
}

async function edition(origin: string): Promise<Response> {
  const store = kv()
  const subs = Object.entries(await store.hgetall(SUBS))
  const lead = await leadHeadline()
  const notice: Notice = { title: 'Your PaperWing edition is ready', body: lead ? `Leading today: ${lead}` : 'The best of your topics since yesterday.', url: '/today', tag: 'edition' }
  let sent = 0
  const gone: string[] = []
  await Promise.allSettled(
    subs.map(async ([field, raw]) => {
      const sub = parse(raw)
      // Devices registered before alerts existed have no preferences: they asked for the edition.
      if (!sub || sub.alerts?.edition === false) return
      if (await send(sub, pushPayload(notice, origin, sub.state?.unseen ?? 0), 6 * 3600)) sent++
      else gone.push(field)
    }),
  )
  await store.hdel(SUBS, gone)
  return json({ sent, removed: gone.length }, 0)
}

/** One alert run: read the world once for everyone, then tell each device what's new for it. */
async function alerts(origin: string): Promise<Response> {
  const store = kv()
  const subs = Object.entries(await store.hgetall(SUBS))
    .map(([field, raw]) => [field, parse(raw)] as const)
    .filter((e): e is readonly [string, SubRecord] => !!e[1]?.alerts)

  const wantedPages = new Set(subs.flatMap(([, s]) => s.alerts!.incidents))
  const builtIn = [...wantedPages].filter((p) => STATUS_PAGES.some((x) => x.id === p))
  const hosts = [...wantedPages].filter((p) => !STATUS_PAGES.some((x) => x.id === p))
  // Threads to count, taken in turns from each device, so one device watching hundreds can't
  // crowd out everyone else's.
  const lists = subs.filter(([, s]) => s.alerts!.replies).map(([, s]) => s.alerts!.watched.map((w) => w.key))
  const watched: string[] = []
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) watched.push(l[i])
  const wantsOutages = subs.some(([, s]) => s.alerts!.outages)

  const [incidents, counts, spikes] = await Promise.all([
    // An empty id list means every built-in page; a page nobody asked for shouldn't be fetched.
    wantedPages.size ? statusIncidents(builtIn.length ? builtIn : ['-'], true, hosts).catch(() => []) : Promise.resolve([]),
    commentCounts(watched.slice(0, 300)),
    wantsOutages
      ? outageReport().then(
          (r) => r.providers,
          () => [],
        )
      : Promise.resolve([]),
  ])
  const world: World = { incidents: incidents.filter((s) => wantedPages.has(incidentSource(s.key))), counts, spikes, now: Date.now() }

  let sent = 0
  const gone: string[] = []
  const updates: [string, string][] = []
  await Promise.allSettled(
    subs.map(async ([field, sub]) => {
      const { notices, state } = planAlerts(sub, world)
      let badge = (sub.state ?? emptyState()).unseen
      for (const n of notices) {
        if (!(await send(sub, pushPayload(n, origin, ++badge), 3 * 3600))) return void gone.push(field)
        sent++
      }
      if (JSON.stringify(state) !== JSON.stringify(sub.state)) updates.push([field, JSON.stringify({ ...sub, state })])
    }),
  )
  if (updates.length)
    await store.hset(
      SUBS,
      updates.filter(([f]) => !gone.includes(f)),
    )
  await store.hdel(SUBS, gone)
  await store.set(ALERTS_AT, String(Date.now()), 7 * 86_400)
  return json({ devices: subs.length, sent, removed: gone.length, incidents: world.incidents.length, threads: counts.size, spikes: spikes.filter((s) => s.level === 'spike').length }, 0)
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const p = url.searchParams
  if (p.has('key')) {
    if (!configured()) return json({ enabled: false }, 60)
    const [{ publicKey }, at] = await Promise.all([vapidKeys(), kv().get(ALERTS_AT)])
    return json({ enabled: true, publicKey, alertsAt: Number(at) || undefined, scheduler: qstashConfigured() }, 60)
  }

  // A scheduled run: Vercel's cron or another scheduler with CRON_SECRET, or QStash's signature for
  // alerts. With neither set up, nobody can trigger sends.
  const secret = process.env.CRON_SECRET
  const task = p.get('task') === 'alerts' ? 'alerts' : 'edition'
  const allowed = (!!secret && sameSecret(request.headers.get('authorization'), secret)) || verifyQStash(request)
  if (!allowed) return fail('Not allowed', 401)
  if (!configured()) return fail('Push is not set up', 501)
  const { publicKey, privateKey } = await vapidKeys()
  webpush.setVapidDetails(SUBJECT, publicKey, privateKey)
  // Notification links need the app's address: production's, never a preview's.
  const origin = publicOrigin(request.url)
  return task === 'alerts' ? alerts(origin) : edition(origin)
}

/**
 * A test notification to one device, from Settings. Knowing the device's push endpoint is the
 * permission: only that browser has it. A few a minute at most.
 */
async function sendTest(endpoint: string, origin: string): Promise<Response> {
  const store = kv()
  const field = id(endpoint)
  const [raw] = await store.hmget(SUBS, [field])
  const sub = raw ? parse(raw) : undefined
  if (!sub) return fail("This device isn't registered for notifications. Turn them off and on again.", 404)
  if (await overLimit(`rd:push:test:${field}`, 60, 3)) return fail('That was a lot of tests. Try again in a minute.', 429)
  const { publicKey, privateKey } = await vapidKeys()
  webpush.setVapidDetails(SUBJECT, publicKey, privateKey)
  const notice: Notice = { title: 'PaperWing notifications work', body: 'This device will get the alerts you choose in Settings.', url: '/settings/notifications', tag: 'test' }
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, pushPayload(notice, origin, sub.state?.unseen ?? 0), { TTL: 600, urgency: 'high', timeout: SEND_TIMEOUT })
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) {
      await store.hdel(SUBS, [field])
      return fail('Your browser has dropped this subscription. Turn notifications off and on again.', 410)
    }
    return fail('The push service refused it', 502)
  }
  return json({ ok: true }, 0)
}

const validPrefs = (a: unknown): AlertPrefs | undefined => {
  if (!a || typeof a !== 'object') return undefined
  const x = a as Partial<AlertPrefs>
  return {
    edition: x.edition !== false,
    replies: !!x.replies,
    outages: !!x.outages,
    incidents: (Array.isArray(x.incidents) ? x.incidents : []).filter((s): s is string => typeof s === 'string' && s.length < 120).slice(0, 60),
    watched: (Array.isArray(x.watched) ? x.watched : [])
      .filter((w) => typeof w?.key === 'string' && w.key.length < 400 && Number.isFinite(w.lookedAt))
      .slice(0, 100)
      .map((w) => ({ key: w.key, title: String(w.title ?? '').slice(0, 160), lookedAt: w.lookedAt })),
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!configured()) return fail('Push is not set up', 501)
  const body = await readJson<{ subscription?: SubRecord; alerts?: unknown; remove?: string; seen?: string; test?: string }>(request)
  if (!body) return fail('Body must be JSON')
  const store = kv()
  if (body.remove) {
    await store.hdel(SUBS, [id(body.remove)])
    return json({ ok: true }, 0)
  }
  if (body.test) return sendTest(body.test, publicOrigin(request.url))
  if (body.seen) {
    // The app is open: the badge starts again from nothing.
    const field = id(body.seen)
    const [raw] = await store.hmget(SUBS, [field])
    const sub = raw ? parse(raw) : undefined
    if (sub?.state?.unseen) await store.hset(SUBS, [[field, JSON.stringify({ ...sub, state: { ...sub.state, unseen: 0 } })]])
    return json({ ok: true }, 0)
  }
  const sub = body.subscription
  if (!sub?.endpoint || !pushHost(sub.endpoint) || !validKeys(sub.keys) || JSON.stringify(sub).length > 2000) return fail('Bad subscription')
  const field = id(sub.endpoint)
  const [raw] = await store.hmget(SUBS, [field])
  // New devices are few per person: a handful an hour from one address, so nobody can fill the list.
  if (!raw) {
    if (await overLimit(`rd:push:new:${clientKey(request)}`, 3600, 6)) return fail('Too many new devices from here. Try again later.', 429)
  }
  if (!raw && Object.keys(await store.hgetall(SUBS)).length >= MAX_SUBS) return fail('Too many devices are registered here', 429)
  const held = raw ? parse(raw) : undefined
  const alerts = body.alerts === undefined ? held?.alerts : validPrefs(body.alerts)
  // What a device was already told survives it updating its preferences.
  const record: SubRecord = { endpoint: sub.endpoint, keys: sub.keys, ...(alerts ? { alerts } : {}), ...(held?.state ? { state: held.state } : {}) }
  if (JSON.stringify(record).length > 60_000) return fail('Too much to watch')
  await store.hset(SUBS, [[field, JSON.stringify(record)]])
  // The first device to subscribe sets up the schedules; after that, at most a check a day (each
  // device re-registers at launch), which also brings back a schedule someone deleted. A deploy
  // that changes what the schedules send (address, bypass secret) re-creates them straight away.
  const origin = publicOrigin(request.url)
  if (qstashConfigured() && (await store.get(SCHEDULED_AT)) !== scheduleSignature(origin)) {
    if (await ensureSchedules(origin).catch(() => false)) await store.set(SCHEDULED_AT, scheduleSignature(origin), 86_400)
  }
  return json({ ok: true }, 0)
}
