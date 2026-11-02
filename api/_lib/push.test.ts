import { createECDH } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const sent: { endpoint: string; payload: { notification: { title: string; app_badge: string; navigate: string } } }[] = []
let counts = new Map<string, number>()
/** What the push service does with each send: deliver by default; a test can make it fail or wait. */
let deliver: (endpoint: string) => Promise<void> = async () => {}
/** The custom status pages each alert run asked about. */
const askedHosts: string[][] = []

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      await deliver(sub.endpoint)
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) })
    },
  },
}))
vi.mock('./threadCounts.js', () => ({ commentCounts: async () => counts }))
vi.mock('./outageScan.js', () => ({ outageReport: async () => ({ providers: [] }) }))
vi.mock('./statuspages.js', async (orig) => ({
  ...(await orig<typeof import('./statuspages.js')>()),
  statusIncidents: async (_ids: string[], _active: boolean, hosts: string[] = []) => (
    askedHosts.push(hosts),
    [
      {
        key: 'st-github-x1',
        source: 'status',
        sourceLabel: 'GitHub status',
        title: 'Actions down',
        url: null,
        discussionUrl: null,
        createdAt: 0,
        hasThread: true,
        weight: 450,
        text: '<p>Ongoing: investigating, critical impact.</p>',
      },
    ]
  ),
}))

let push: typeof import('../push')
beforeAll(async () => {
  process.env.SYNC_MEMORY = '1'
  process.env.CRON_SECRET = 'cron'
  process.env.VAPID_PUBLIC_KEY = 'BPub'
  process.env.VAPID_PRIVATE_KEY = 'priv'
  push = await import('../push')
})

const post = (body: unknown) => push.POST(new Request('https://readout.test/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
const run = () => push.GET(new Request('https://readout.test/api/push?task=alerts', { headers: { authorization: 'Bearer cron' } }))
// Keys shaped like a browser's: a 65-byte public key and a 16-byte secret.
const device = createECDH('prime256v1')
const KEYS = { p256dh: device.generateKeys().toString('base64url'), auth: Buffer.alloc(16, 7).toString('base64url') }
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/device-1', keys: KEYS }

describe('alert run', () => {
  it('needs the cron secret', async () => {
    expect((await push.GET(new Request('https://readout.test/api/push?task=alerts'))).status).toBe(401)
  })

  it('tells a device about its incidents and new replies, counting the badge, and resets when the app opens', async () => {
    const alerts = { edition: true, replies: true, outages: false, incidents: ['github'], watched: [{ key: 'hn-1', title: 'A thread', lookedAt: 1 }] }
    expect((await post({ subscription, alerts })).status).toBe(200)

    counts = new Map([['hn-1', 10]])
    await run()
    expect(sent.map((s) => s.payload.notification.title)).toEqual(['GitHub: Actions down'])
    expect(sent[0].payload.notification).toMatchObject({ app_badge: '1', navigate: 'https://readout.test/t/status/st-github-x1' })

    counts = new Map([['hn-1', 12]])
    await run()
    expect(sent.map((s) => s.payload.notification.title)).toEqual(['GitHub: Actions down', '2 new replies'])
    expect(sent[1].payload.notification.app_badge).toBe('2')

    // Updating preferences keeps what the device was already told.
    await post({ subscription, alerts })
    counts = new Map([['hn-1', 12]])
    await run()
    expect(sent).toHaveLength(2)

    await post({ seen: subscription.endpoint })
    counts = new Map([['hn-1', 13]])
    await run()
    expect(sent[2].payload.notification).toMatchObject({ title: '1 new reply', app_badge: '1' })
  })

  it('reports when alerts last ran', async () => {
    const info = (await (await push.GET(new Request('https://readout.test/api/push?key'))).json()) as { alertsAt?: number }
    expect(info.alertsAt).toBeGreaterThan(Date.now() - 60_000)
  })
})

describe('test notification', () => {
  it('goes only to the device that asked, a few a minute at most', async () => {
    const before = sent.length
    expect((await post({ test: subscription.endpoint })).status).toBe(200)
    expect(sent.slice(before).map((s) => [s.endpoint, s.payload.notification.title])).toEqual([[subscription.endpoint, 'PaperWing notifications work']])
    expect((await post({ test: 'https://fcm.googleapis.com/fcm/send/unknown' })).status).toBe(404)
    await post({ test: subscription.endpoint })
    await post({ test: subscription.endpoint })
    expect((await post({ test: subscription.endpoint })).status).toBe(429)
  })
})

describe('registration', () => {
  it('only takes endpoints on real push services', async () => {
    for (const endpoint of ['https://attacker.example/hook', 'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.example/x', 'https://169.254.169.254/latest']) {
      expect((await post({ subscription: { endpoint, keys: KEYS } })).status).toBe(400)
    }
    expect((await post({ subscription: { endpoint: 'https://web.push.apple.com/abc', keys: KEYS } })).status).toBe(200)
    // Keys no browser would make are refused: they could never be sent to, only fill the list.
    expect((await post({ subscription: { endpoint: 'https://web.push.apple.com/def', keys: { p256dh: 'x', auth: 'x' } } })).status).toBe(400)
    // Nor is a key of the right length that isn't a point on the curve.
    expect((await post({ subscription: { endpoint: 'https://web.push.apple.com/ghi', keys: { ...KEYS, p256dh: Buffer.alloc(65, 4).toString('base64url') } } })).status).toBe(400)
  })
})

// The alert run against what really happens around it: push services that hiccup, people changing
// their settings while it runs, lots of devices, and devices nobody uses any more.
describe('alert run, around the edges', () => {
  const kvMod = () => import('./kv.js')
  const reset = async () => {
    const { kv } = await kvMod()
    await kv().hdel('rd:push:subs', Object.keys(await kv().hgetall('rd:push:subs')))
    await kv().hdel('rd:push:state', Object.keys(await kv().hgetall('rd:push:state')))
    sent.length = 0
    askedHosts.length = 0
    deliver = async () => {}
    counts = new Map()
  }
  const device = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/edge-${n}`, keys: KEYS })
  // Each device from its own address: one address may only add a few devices an hour.
  const from = (n: number, body: unknown) =>
    push.POST(
      new Request('https://readout.test/api/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${n % 250}`, 'x-real-ip': `198.51.100.${n % 250}` },
        body: JSON.stringify(body),
      }),
    )
  const incidentsOnly = { edition: false, replies: false, outages: false, incidents: ['github'], watched: [] }
  const fieldOf = async (endpoint: string) => (await import('node:crypto')).createHash('sha256').update(endpoint).digest('hex').slice(0, 32)

  it('keeps an alert the push service couldn’t take just now, and sends it on the next run', async () => {
    await reset()
    await from(1, { subscription: device(1), alerts: incidentsOnly })
    deliver = async () => {
      throw Object.assign(new Error('Service Unavailable'), { statusCode: 503 })
    }
    await run()
    expect(sent).toHaveLength(0)
    deliver = async () => {}
    await run()
    expect(sent.map((s) => s.payload.notification.title)).toEqual(['GitHub: Actions down'])
  })

  it('so is the push service asking to slow down (429)', async () => {
    await reset()
    await from(16, { subscription: device(16), alerts: incidentsOnly })
    deliver = async () => {
      throw Object.assign(new Error('Too Many Requests'), { statusCode: 429 })
    }
    await run()
    deliver = async () => {}
    await run()
    expect(sent).toHaveLength(1)
  })

  it('a timeout is a hiccup too, not a delivery', async () => {
    await reset()
    await from(2, { subscription: device(2), alerts: incidentsOnly })
    deliver = async () => {
      throw new Error('socket hang up')
    }
    await run()
    deliver = async () => {}
    await run()
    expect(sent).toHaveLength(1)
  })

  it('a device the browser dropped is forgotten', async () => {
    await reset()
    await from(3, { subscription: device(3), alerts: incidentsOnly })
    deliver = async () => {
      throw Object.assign(new Error('Gone'), { statusCode: 410 })
    }
    await run()
    const { kv } = await kvMod()
    expect(await kv().hgetall('rd:push:subs')).toEqual({})
  })

  it('what a device changes while a run is sending is kept: new settings, a reset badge, a removal', async () => {
    await reset()
    await from(4, { subscription: device(4), alerts: incidentsOnly })
    await from(5, { subscription: device(5), alerts: incidentsOnly })
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    deliver = () => held
    const running = run()
    await new Promise((r) => setTimeout(r, 20))
    // Mid-run: device 4 changes its settings, device 5 turns notifications off.
    await from(4, { subscription: device(4), alerts: { ...incidentsOnly, outages: true } })
    await post({ remove: device(5).endpoint })
    release()
    await running
    const { kv } = await kvMod()
    const subs = await kv().hgetall('rd:push:subs')
    expect(Object.values(subs).map((r) => JSON.parse(r).endpoint)).toEqual([device(4).endpoint])
    expect(JSON.parse(Object.values(subs)[0]).alerts.outages).toBe(true)
    // Nothing of the device that turned off is kept, not even what it was told.
    expect(Object.keys(await kv().hgetall('rd:push:state'))).toEqual([await fieldOf(device(4).endpoint)])
  })

  it('the badge starts again from nothing once the app has been opened', async () => {
    await reset()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      await from(6, { subscription: device(6), alerts: incidentsOnly })
      await run()
      expect(sent.at(-1)?.payload.notification.app_badge).toBe('1')
      // Opened a moment later (it registers at launch, two seconds before it can say it's open).
      vi.setSystemTime(Date.now() + 5_000)
      await post({ seen: device(6).endpoint })
      counts = new Map()
      // A new incident later: counted from nothing again.
      const { kv } = await kvMod()
      const [field] = Object.keys(await kv().hgetall('rd:push:state'))
      const state = JSON.parse((await kv().hmget('rd:push:state', [field]))[0]!)
      await kv().hset('rd:push:state', [[field, JSON.stringify({ ...state, incidents: [] })]])
      await run()
      expect(sent.at(-1)?.payload.notification.app_badge).toBe('1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('every device’s status pages get checked, however many other devices follow', async () => {
    await reset()
    for (let n = 0; n < 30; n++) await from(100 + n, { subscription: device(100 + n), alerts: { ...incidentsOnly, incidents: [`status${n}.example.com`] } })
    for (let i = 0; i < 3; i++) await run()
    const checked = new Set(askedHosts.flat())
    for (let n = 0; n < 30; n++) expect(checked).toContain(`status${n}.example.com`)
    // Asked in batches the status page reader takes whole (it reads at most 25 custom pages a call).
    for (const batch of askedHosts) expect(batch.length).toBeLessThanOrEqual(25)
  })

  it('takes at most ten followed status pages from one device', async () => {
    await reset()
    await from(7, { subscription: device(7), alerts: { ...incidentsOnly, incidents: ['github', ...Array.from({ length: 20 }, (_, i) => `p${i}.example.com`)] } })
    const { kv } = await kvMod()
    const [raw] = Object.values(await kv().hgetall('rd:push:subs'))
    expect(JSON.parse(raw).alerts.incidents).toEqual(['github', ...Array.from({ length: 10 }, (_, i) => `p${i}.example.com`)])
  })

  it('forgets a device nobody has opened PaperWing on in sixty days', async () => {
    await reset()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      await from(8, { subscription: device(8), alerts: incidentsOnly })
      await from(9, { subscription: device(9), alerts: incidentsOnly })
      vi.setSystemTime(Date.now() + 59 * 86_400_000)
      await post({ seen: device(9).endpoint })
      vi.setSystemTime(Date.now() + 2 * 86_400_000)
      await run()
      const { kv } = await kvMod()
      expect(Object.values(await kv().hgetall('rd:push:subs')).map((r) => JSON.parse(r).endpoint)).toEqual([device(9).endpoint])
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a device whose settings ask for nothing (turning one back on isn’t a new device), and sends it nothing', async () => {
    await reset()
    await from(10, { subscription: device(10), alerts: { edition: false, replies: false, outages: false, incidents: [], watched: [] } })
    await run()
    expect(sent).toHaveLength(0)
    expect((await from(10, { subscription: device(10), alerts: incidentsOnly })).status).toBe(200)
    await run()
    expect(sent).toHaveLength(1)
  })

  it('a device from before alert state had its own place keeps what it was told: no repeats', async () => {
    await reset()
    const { kv } = await kvMod()
    const { createHash } = await import('node:crypto')
    const old = device(11)
    const field = createHash('sha256').update(old.endpoint).digest('hex').slice(0, 32)
    await kv().hset('rd:push:subs', [[field, JSON.stringify({ ...old, alerts: incidentsOnly, state: { unseen: 1, incidents: ['st-github-x1'], replies: {}, outages: {} } })]])
    await run()
    await run()
    expect(sent).toHaveLength(0)
    expect(Object.keys(await kv().hgetall('rd:push:state'))).toEqual([field])
  })

  it('what a device was told goes with it: a record left without its device is cleared on the next run', async () => {
    await reset()
    const { kv } = await kvMod()
    await kv().hset('rd:push:state', [['f'.repeat(32), JSON.stringify({ unseen: 2, incidents: ['st-x'], replies: {}, outages: {} })]])
    await run()
    expect(await kv().hgetall('rd:push:state')).toEqual({})
  })

  it('one unreadable record doesn’t stop the run for everyone', async () => {
    await reset()
    const { kv } = await kvMod()
    await from(12, { subscription: device(12), alerts: incidentsOnly })
    await kv().hset('rd:push:state', [[await fieldOf(device(12).endpoint), '{not json']])
    expect((await run()).status).toBe(200)
    expect(sent).toHaveLength(1)
  })

  it('devices a run had no time for are first in line next run', async () => {
    await reset()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      for (let n = 0; n < 60; n++) await from(200 + n, { subscription: device(200 + n), alerts: incidentsOnly })
      // The first send takes the whole budget: the run starts no more after it.
      let first = true
      deliver = async () => {
        if (first) vi.setSystemTime(Date.now() + 41_000)
        first = false
      }
      await run()
      const reached = new Set(sent.map((s) => s.endpoint))
      expect(reached.size).toBeLessThan(60)
      deliver = async () => {}
      await run()
      expect(new Set(sent.map((s) => s.endpoint)).size).toBe(60)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reads every followed status page in turn, however many there are', async () => {
    await reset()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      for (let n = 0; n < 25; n++) await from(300 + n, { subscription: device(300 + n), alerts: { ...incidentsOnly, incidents: Array.from({ length: 10 }, (_, i) => `s${n}-${i}.example.com`) } })
      for (let i = 0; i < 4; i++) {
        await run()
        vi.setSystemTime(Date.now() + 300_000)
      }
      const perRun = askedHosts.length / 4
      expect(perRun).toBeGreaterThan(0)
      expect(new Set(askedHosts.flat()).size).toBe(250)
      for (const batch of askedHosts) expect(batch.length).toBeLessThanOrEqual(25)
    } finally {
      vi.useRealTimers()
    }
  })

  it('forgets an old device that never said when it was last opened, sixty days after first knowing it', async () => {
    await reset()
    const { kv } = await kvMod()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      // From before alerts and before seenAt: the edition only, nothing else on record.
      const legacy = device(13)
      await kv().hset('rd:push:subs', [[await fieldOf(legacy.endpoint), JSON.stringify(legacy)]])
      await run()
      vi.setSystemTime(Date.now() + 59 * 86_400_000)
      await run()
      expect(Object.keys(await kv().hgetall('rd:push:subs'))).toHaveLength(1)
      vi.setSystemTime(Date.now() + 2 * 86_400_000)
      await run()
      expect(await kv().hgetall('rd:push:subs')).toEqual({})
      expect(await kv().hgetall('rd:push:state')).toEqual({})
    } finally {
      vi.useRealTimers()
    }
  })

  it('a device opened again while a run is deciding to forget it is kept', async () => {
    await reset()
    const { kv } = await kvMod()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      await from(14, { subscription: device(14), alerts: incidentsOnly })
      await from(15, { subscription: device(15), alerts: incidentsOnly })
      vi.setSystemTime(Date.now() + 61 * 86_400_000)
      // Device 15 is opened while the run is sending to the others.
      deliver = async (endpoint) => {
        if (endpoint === device(14).endpoint) await from(15, { seen: device(15).endpoint })
      }
      await kv().hset('rd:push:subs', [[await fieldOf(device(14).endpoint), JSON.stringify({ ...device(14), alerts: incidentsOnly, seenAt: Date.now() })]])
      await run()
      expect(
        Object.values(await kv().hgetall('rd:push:subs'))
          .map((r) => JSON.parse(r).endpoint)
          .sort(),
      ).toEqual([device(14).endpoint, device(15).endpoint].sort())
    } finally {
      vi.useRealTimers()
    }
  })
})
