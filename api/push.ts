import { createECDH, createHash, timingSafeEqual } from 'node:crypto'
import webpush from 'web-push'
import { emptyState, incidentSource, planAlerts, pushPayload, type AlertPrefs, type AlertState, type Notice, type SubRecord, type World } from './_lib/alerts.js'
import { clientKey, fail, json, readJson } from './_lib/http.js'
import { kv, kvConfigured, overLimit } from './_lib/kv.js'
import { outageReport } from './_lib/outageScan.js'
import { ensureSchedules, publicOrigin, qstashConfigured, scheduleSignature, verifyQStash } from './_lib/qstash.js'
import { MAX_CUSTOM, STATUS_PAGES, statusIncidents } from './_lib/statuspages.js'
import { commentCounts } from './_lib/threadCounts.js'
import { alertPages } from '../src/lib/statusPageList.js'

// Notifications. Subscriptions, with what each device wants to hear about, live in the sync store.
//   GET  /api/push?key            whether push is set up, the public key, when alerts last ran
//   GET  /api/push?task=edition   the daily edition
//   GET  /api/push?task=alerts    replies, incidents and outage spikes, every five minutes
// Both runs come from Upstash QStash schedules PaperWing creates itself (api/_lib/qstash.ts), signed
// by QStash; CRON_SECRET as a bearer token works too, for any other scheduler.
//   POST /api/push                { subscription, alerts } to register, { remove }, { seen } when the app opens,
//                                 or { test } to send this device a test notification

const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:readout@example.com'
/** Devices, written only by their own requests (registering, opening the app, turning off). */
const SUBS = 'rd:push:subs'
/** What the alert run has told each device, written only by the alert run. */
const STATE = 'rd:push:state'
/** When PaperWing was last opened on each device, written only by the device (registering, opening the app). */
const SEEN = 'rd:push:seen'
/** How many alert runs there have been (this month): what each run takes from long lists. */
const TURN = 'rd:push:turn'
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
/** Sends at once in an alert run. */
const SEND_AT_ONCE = 50
/** The alert run stops sending after this and picks up on the next run: its function gets a minute. */
const RUN_BUDGET = 40_000
/** A device nobody has opened PaperWing on for this long is forgotten (it can turn notifications on again). */
const FORGET_AFTER = 60 * 86_400_000
/** Followed status pages checked per alert run, a batch at a time; past that, the next run takes the next ones. */
const PAGES_PER_RUN = 4 * MAX_CUSTOM

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
 * Sends to one device. `gone`: forget the device (the browser dropped it, the push service refuses
 * it outright, or it can't be encrypted for). `retry`: the push service couldn't take it just now
 * (a timeout, 429, 5xx), so the alert stays for the next run: a repeat (the device shows one
 * notification per tag) beats a lost alert.
 */
type Sent = 'sent' | 'gone' | 'retry'
async function send(sub: SubRecord, payload: string, ttl: number): Promise<Sent> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: ttl, urgency: 'normal', timeout: SEND_TIMEOUT })
    return 'sent'
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === undefined) return validKeys(sub.keys) ? 'retry' : 'gone'
    if ([400, 403, 404, 410].includes(status)) return 'gone'
    // Any other refusal of this one message (too large, say) won't change by trying again.
    return status === 429 || status >= 500 ? 'retry' : 'sent'
  }
}

/** Runs `fn` over `items`, `limit` at a time, starting no new one after `until`. */
async function eachUntil<T>(items: T[], limit: number, until: number, fn: (t: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length && Date.now() < until) await fn(items[next++]).catch(() => {})
    }),
  )
}

/** What the alert run told a device, or nothing when the record can't be read (it starts again). */
const parseState = (raw: string | undefined): AlertState | undefined => {
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as AlertState
  } catch {
    return undefined
  }
}

/**
 * Every device, with when PaperWing was last opened on it and what the alert run has told it
 * (from its own key, or where it lived before), and any records left without their device.
 */
async function devices(): Promise<{ all: { field: string; sub: SubRecord; state?: AlertState }[]; orphans: string[] }> {
  const store = kv()
  const [subs, states, seen] = await Promise.all([store.hgetall(SUBS), store.hgetall(STATE), store.hgetall(SEEN)])
  const all = Object.entries(subs).flatMap(([field, raw]) => {
    const sub = parse(raw)
    if (!sub) return []
    const opened = Math.max(sub.seenAt ?? 0, Number(seen[field]) || 0) || undefined
    return [{ field, sub: { ...sub, seenAt: opened }, state: field in states ? parseState(states[field]) : sub.state }]
  })
  const orphans = [...new Set([...Object.keys(states), ...Object.keys(seen)])].filter((f) => !(f in subs))
  return { all, orphans }
}

/** The icon badge: notifications since the app was last opened (opening it starts again from nothing). */
const badgeOf = (sub: SubRecord, state: AlertState | undefined) => (!state || (sub.seenAt ?? 0) > (state.badgeFrom ?? 0) ? 0 : state.unseen)

async function edition(origin: string): Promise<Response> {
  const { all } = await devices()
  const lead = await leadHeadline()
  const notice: Notice = { title: 'Your PaperWing edition is ready', body: lead ? `Leading today: ${lead}` : 'The best of your topics since yesterday.', url: '/today', tag: 'edition' }
  let sent = 0
  const gone: string[] = []
  await eachUntil(all, SEND_AT_ONCE, Date.now() + RUN_BUDGET, async ({ field, sub, state }) => {
    // Devices registered before alerts existed have no preferences: they asked for the edition.
    if (sub.alerts?.edition === false) return
    const outcome = await send(sub, pushPayload(notice, origin, badgeOf(sub, state)), 6 * 3600)
    if (outcome === 'sent') sent++
    else if (outcome === 'gone') gone.push(field)
  })
  await forget(gone)
  return json({ sent, removed: gone.length }, 0)
}

/** Forgets devices: their registration, when they were opened, and what they were told. */
async function forget(fields: string[]) {
  if (!fields.length) return
  await Promise.all([kv().hdel(SUBS, fields), kv().hdel(STATE, fields), kv().hdel(SEEN, fields)])
}

/** `items` starting at the `turn`th: each run starts somewhere else. */
const rotate = <T>(items: T[], turn: number): T[] => {
  if (!items.length) return items
  const start = turn % items.length
  return [...items.slice(start), ...items.slice(0, start)]
}

/**
 * The custom status pages to check this run: taken from each device in turn (so one device's
 * pages can't crowd out another's), and past PAGES_PER_RUN, the next stretch each run.
 */
function pagesThisRun(lists: string[][], turn: number): string[] {
  const all: string[] = []
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length && !all.includes(l[i])) all.push(l[i])
  return all.length <= PAGES_PER_RUN ? all : rotate(all, turn * PAGES_PER_RUN).slice(0, PAGES_PER_RUN)
}

/** One alert run: read the world once for everyone, then tell each device what's new for it. */
async function alerts(origin: string): Promise<Response> {
  const store = kv()
  const now = Date.now()
  const until = now + RUN_BUDGET
  // Which run this is: what each run takes from long lists (pages, devices) starts where the last left off.
  const turn = (await store.bump(TURN, 30 * 86_400).catch(() => 1)) - 1
  const { all: everyone, orphans } = await devices()

  // Devices nobody has opened PaperWing on in a long while go. One from before `seenAt` was kept
  // counts from when a run first knew it, which is noted for every such device, alerts or not.
  const stale = everyone.filter(({ sub, state }) => (sub.seenAt ?? state?.firstSeenAt ?? now) < now - FORGET_AFTER).map((d) => d.field)
  const told = new Map<string, string>(
    everyone
      .filter(({ field, sub, state }) => !sub.seenAt && !state?.firstSeenAt && !stale.includes(field))
      .map(({ field, state }) => [field, JSON.stringify({ ...emptyState(), ...state, firstSeenAt: now })]),
  )
  // Starting somewhere else each run: when a run runs out of time, it isn't always the same devices that wait.
  const subs = rotate(
    everyone.filter((d) => !stale.includes(d.field) && d.sub.alerts),
    turn * SEND_AT_ONCE,
  )

  const isBuiltIn = (p: string) => STATUS_PAGES.some((x) => x.id === p)
  const wantedPages = new Set(subs.flatMap(({ sub }) => sub.alerts!.incidents))
  const builtIn = [...wantedPages].filter(isBuiltIn)
  const hosts = pagesThisRun(
    subs.map(({ sub }) => sub.alerts!.incidents.filter((p) => !isBuiltIn(p))),
    turn,
  )
  // Threads to count, taken in turns from each device, so one device watching hundreds can't
  // crowd out everyone else's.
  const lists = subs.filter(({ sub }) => sub.alerts!.replies).map(({ sub }) => sub.alerts!.watched.map((w) => w.key))
  const watched: string[] = []
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) watched.push(l[i])
  const wantsOutages = subs.some(({ sub }) => sub.alerts!.outages)

  // Built-in pages with the first batch of followed ones; the rest a batch per request, as many as the reader takes.
  const batches: string[][] = []
  for (let i = 0; i < hosts.length; i += MAX_CUSTOM) batches.push(hosts.slice(i, i + MAX_CUSTOM))
  const [incidents, counts, spikes] = await Promise.all([
    wantedPages.size
      ? Promise.all(
          (batches.length ? batches : [[]]).map((batch, i) =>
            // An empty id list means every built-in page; a page nobody asked for shouldn't be fetched.
            statusIncidents(i === 0 && builtIn.length ? builtIn : ['-'], true, batch).catch(() => []),
          ),
        ).then((r) => r.flat())
      : Promise.resolve([]),
    commentCounts(watched.slice(0, 300)),
    wantsOutages
      ? outageReport().then(
          (r) => r.providers,
          () => [],
        )
      : Promise.resolve([]),
  ])
  const world: World = { incidents: incidents.filter((s) => wantedPages.has(incidentSource(s.key))), counts, spikes, now }

  let sent = 0
  let later = 0
  const gone: string[] = []
  await eachUntil(subs, SEND_AT_ONCE, until, async ({ field, sub, state: held }) => {
    const before: AlertState = { ...emptyState(), ...held, firstSeenAt: held?.firstSeenAt ?? now }
    // The app was opened since the badge was last counted: it starts again from nothing.
    if ((sub.seenAt ?? 0) > (before.badgeFrom ?? 0)) Object.assign(before, { unseen: 0, badgeFrom: sub.seenAt })
    const { notices, state } = planAlerts({ ...sub, state: before }, world)
    let badge = before.unseen
    for (const n of notices) {
      const outcome = await send(sub, pushPayload(n, origin, ++badge), 3 * 3600)
      if (outcome === 'gone') return void gone.push(field)
      // Not taken just now: nothing it was told this run counts, so the next run plans it again.
      if (outcome === 'retry') return void later++
      sent++
    }
    if (JSON.stringify(state) !== JSON.stringify(held)) told.set(field, JSON.stringify(state))
  })

  // Read again before writing: a device turned off during the run stays off, and one opened during it isn't stale.
  const fields = [...new Set([...told.keys(), ...stale])]
  const [nowSubs, nowSeen] = fields.length ? await Promise.all([store.hmget(SUBS, fields), store.hmget(SEEN, fields)]) : [[], []]
  const present = new Set(fields.filter((_, i) => nowSubs[i] !== null))
  const opened = new Map(fields.map((f, i) => [f, Math.max(parse(nowSubs[i] ?? '')?.seenAt ?? 0, Number(nowSeen[i]) || 0)]))
  const stillStale = stale.filter((f) => !opened.get(f) || opened.get(f)! < now - FORGET_AFTER)
  await store.hset(
    STATE,
    [...told].filter(([f]) => present.has(f) && !gone.includes(f) && !stillStale.includes(f)),
  )
  await forget([...gone, ...stillStale, ...orphans])
  await store.set(ALERTS_AT, String(Date.now()), 7 * 86_400)
  return json(
    { devices: subs.length, sent, later, removed: gone.length + stillStale.length, incidents: world.incidents.length, threads: counts.size, spikes: spikes.filter((s) => s.level === 'spike').length },
    0,
  )
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
  const [[raw], [told]] = await Promise.all([store.hmget(SUBS, [field]), store.hmget(STATE, [field])])
  const sub = raw ? parse(raw) : undefined
  if (!sub) return fail("This device isn't registered for notifications. Turn them off and on again.", 404)
  const unseen = badgeOf(sub, told ? (JSON.parse(told) as AlertState) : sub.state)
  if (await overLimit(`rd:push:test:${field}`, 60, 3)) return fail('That was a lot of tests. Try again in a minute.', 429)
  const { publicKey, privateKey } = await vapidKeys()
  webpush.setVapidDetails(SUBJECT, publicKey, privateKey)
  const notice: Notice = { title: 'PaperWing notifications work', body: 'This device will get the alerts you choose in Settings.', url: '/settings/notifications', tag: 'test' }
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, pushPayload(notice, origin, unseen), { TTL: 600, urgency: 'high', timeout: SEND_TIMEOUT })
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) {
      await forget([field])
      return fail('Your browser has dropped this subscription. Turn notifications off and on again.', 410)
    }
    return fail('The push service refused it', 502)
  }
  return json({ ok: true }, 0)
}

const validPrefs = (a: unknown): AlertPrefs | undefined => {
  if (!a || typeof a !== 'object') return undefined
  const x = a as Partial<AlertPrefs>
  const pages = (Array.isArray(x.incidents) ? x.incidents : []).filter((s): s is string => typeof s === 'string' && s.length < 120)
  return {
    edition: x.edition !== false,
    replies: !!x.replies,
    outages: !!x.outages,
    // Every built-in page, and up to ten of your own: each run reads them all for everyone.
    incidents: alertPages([...new Set(pages)]),
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
    await forget([id(body.remove)])
    return json({ ok: true }, 0)
  }
  if (body.test) return sendTest(body.test, publicOrigin(request.url))
  if (body.seen) {
    // The app is open: the device is in use, and its badge starts again from nothing (the alert run
    // counts from here). Its own key, so this can't undo a settings change made at the same moment.
    const field = id(body.seen)
    const [raw] = await store.hmget(SUBS, [field])
    if (raw) await store.hset(SEEN, [[field, String(Date.now())]])
    return json({ ok: true }, 0)
  }
  const sub = body.subscription
  if (!sub?.endpoint || !pushHost(sub.endpoint) || !validKeys(sub.keys) || JSON.stringify(sub).length > 2000) return fail('Bad subscription')
  const field = id(sub.endpoint)
  const [[raw], [moved]] = await Promise.all([store.hmget(SUBS, [field]), store.hmget(STATE, [field])])
  // New devices are few per person: a handful an hour from one address, so nobody can fill the list.
  if (!raw) {
    if (await overLimit(`rd:push:new:${clientKey(request)}`, 3600, 6)) return fail('Too many new devices from here. Try again later.', 429)
  }
  const held = raw ? parse(raw) : undefined
  const alerts = body.alerts === undefined ? held?.alerts : validPrefs(body.alerts)
  if (!raw && (await store.hlen(SUBS)) >= MAX_SUBS) return fail('Too many devices are registered here', 429)
  // It registers at launch, so this is the device in use. (State from before it had its own key
  // rides along until the alert run has moved it.)
  const record: SubRecord = { endpoint: sub.endpoint, keys: sub.keys, ...(alerts ? { alerts } : {}), seenAt: Date.now(), ...(held?.state && !moved ? { state: held.state } : {}) }
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
