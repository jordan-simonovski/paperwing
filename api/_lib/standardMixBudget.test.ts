import { describe, expect, it, vi } from 'vitest'
import { call, fakeUpstreams, memoryStore } from '../_test/harness'
import { fanOutLimited, FAN_OUT_PER_MINUTE, kv, MIX_FAN_OUT_PER_MINUTE, overLimit } from './kv'
import { GET as rss } from '../rss'
import { GET as atproto } from '../atproto'

const did = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
const rkey = 'bbbbbbbbbbbbb'
vi.mock('./frontpage.js', async (original) => ({
  ...(await original<typeof import('./frontpage.js')>()),
  getRecord: vi.fn(async () => ({ uri: `at://${did}/io.paperwing.mix/${rkey}`, value: { name: 'Native reading', sources: [{ kind: 'standard', url: 'https://writer.example', label: 'Writer' }] } })),
  handles: vi.fn(async () => new Map()),
}))
fakeUpstreams()
memoryStore()

describe('native publishers in public mix feeds', () => {
  const headers = { 'x-forwarded-for': '203.0.113.19' }
  const bluesky = (key = rkey) => `/api/atproto?route=app.bsky.feed.getFeedSkeleton&feed=${encodeURIComponent(`at://${did}/app.bsky.feed.generator/pw-${key}`)}`

  it('charges a feed reader that reads the mix as RSS to its own allowance', async () => {
    await fanOutLimited(new Request('https://paperwing.io', { headers }), FAN_OUT_PER_MINUTE)
    const res = await call(rss, `/api/rss?path=mix/${did}/${rkey}`, { headers })
    expect(res.status).toBe(429)
    expect(res.headers.get('cache-control')).not.toContain('s-maxage')
  })

  it('charges the mix’s author, not Bluesky’s shared address, when Bluesky reads the mix', async () => {
    // Bluesky asks for every mix from a few addresses: one busy mix mustn't stall everyone else's.
    await fanOutLimited(new Request('https://paperwing.io', { headers: { 'x-forwarded-for': '198.51.100.7' } }), FAN_OUT_PER_MINUTE)
    const res = await call(atproto, bluesky(), { headers: { 'x-forwarded-for': '198.51.100.7' } })
    expect(res.status).toBe(200)
    // The cold read went on the author's allowance: 8 more than a full allowance would be over it.
    expect(await overLimit(`rd:fanout:mix:${did}`, 60, FAN_OUT_PER_MINUTE, FAN_OUT_PER_MINUTE - 7)).toBe(true)
  })

  it('serves a mix without the publications its author can’t afford, rather than failing it', async () => {
    await fanOutLimited({ mix: did }, FAN_OUT_PER_MINUTE)
    const res = await call(atproto, bluesky('ccccccccccccc'), { headers })
    expect(res.status).toBe(200)
  })

  it('caps cold reads across every Bluesky-read mix, so new accounts don’t buy new allowances', async () => {
    await overLimit('rd:fanout:mix:*', 60, MIX_FAN_OUT_PER_MINUTE, MIX_FAN_OUT_PER_MINUTE)
    const fresh = 'did:plc:dddddddddddddddddddddddd'
    const res = await call(atproto, bluesky('eeeeeeeeeeeee').replace(encodeURIComponent(did), encodeURIComponent(fresh)), { headers })
    expect(res.status).toBe(200)
    // Turned away at the ceiling before its author was charged anything.
    expect(await overLimit(`rd:fanout:mix:${fresh}`, 60, FAN_OUT_PER_MINUTE, FAN_OUT_PER_MINUTE)).toBe(false)
  })

  it('keeps a mix served without a publication for a minute, not ten, so it fills in once there’s room', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      await overLimit(`rd:fanout:mix:${did}`, 60, FAN_OUT_PER_MINUTE, FAN_OUT_PER_MINUTE)
      expect((await call(atproto, bluesky('fffffffffffff'), { headers })).status).toBe(200)
      vi.setSystemTime(Date.now() + 61_000)
      expect(await kv().get(`rd:mixfeed:${did}:fffffffffffff`)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves the shared ceiling alone when the author is already over their own allowance', async () => {
    await overLimit(`rd:fanout:mix:${did}`, 60, FAN_OUT_PER_MINUTE, FAN_OUT_PER_MINUTE)
    await call(atproto, bluesky('ggggggggggggg'), { headers })
    expect(await overLimit('rd:fanout:mix:*', 60, MIX_FAN_OUT_PER_MINUTE, MIX_FAN_OUT_PER_MINUTE)).toBe(false)
  })
})
