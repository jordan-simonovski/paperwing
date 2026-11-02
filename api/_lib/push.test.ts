import { createECDH } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const sent: { endpoint: string; payload: { notification: { title: string; app_badge: string; navigate: string } } }[] = []
let counts = new Map<string, number>()

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, payload: string) => void sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }),
  },
}))
vi.mock('./threadCounts.js', () => ({ commentCounts: async () => counts }))
vi.mock('./outageScan.js', () => ({ outageReport: async () => ({ providers: [] }) }))
vi.mock('./statuspages.js', async (orig) => ({
  ...(await orig<typeof import('./statuspages.js')>()),
  statusIncidents: async () => [
    { key: 'st-github-x1', source: 'status', sourceLabel: 'GitHub status', title: 'Actions down', url: null, discussionUrl: null, createdAt: 0, hasThread: true, weight: 450, text: '<p>Ongoing: investigating, critical impact.</p>' },
  ],
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
