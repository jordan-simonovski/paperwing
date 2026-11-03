import { describe, expect, it, vi } from 'vitest'
import { call, fakeUpstreams, memoryStore } from '../_test/harness'
import { fanOutLimited, FAN_OUT_PER_MINUTE, kv, MIX_FAN_OUT_PER_MINUTE, overLimit } from './kv'
import { GET as rss } from '../rss'
import { GET as atproto } from '../atproto'
import { getRecord } from './frontpage'
import { standardFeed } from './standard'

const did = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
const rkey = 'bbbbbbbbbbbbb'
vi.mock('./frontpage.js', async (original) => ({
  ...(await original<typeof import('./frontpage.js')>()),
  getRecord: vi.fn(async () => ({ uri: `at://${did}/io.paperwing.mix/${rkey}`, value: { name: 'Native reading', sources: [{ kind: 'standard', url: 'https://writer.example', label: 'Writer' }] } })),
  handles: vi.fn(async () => new Map()),
}))
const net = fakeUpstreams()
memoryStore()

describe('native publishers in public mix feeds', () => {
  it('keeps the RSS sources that loaded when a native publisher fails', async () => {
    vi.mocked(getRecord).mockResolvedValueOnce({
      cid: 'bafy-mix',
      uri: `at://${did}/io.paperwing.mix/${rkey}`,
      value: {
        name: 'Mixed reading',
        sources: [
          { kind: 'standard', url: 'https://writer.example' },
          { kind: 'rss', url: 'https://healthy.example/rss' },
        ],
      },
    })
    net
      .get('https://healthy.example')
      .intercept({ path: '/rss' })
      .reply(200, '<rss><channel><title>Healthy</title><item><title>Still reading</title><link>https://healthy.example/post</link></item></channel></rss>')
    const res = await call(rss, `/api/rss?path=mix/${did}/${rkey}`)
    expect(res.status).toBe(200)
    expect(res.body).toContain('Still reading')
  })

  it('keeps a Bluesky source that loaded when a native publisher fails', async () => {
    const uri = `at://${did}/app.bsky.feed.generator/healthy`
    const post = `at://${did}/app.bsky.feed.post/healthy`
    vi.mocked(getRecord).mockResolvedValueOnce({
      cid: 'bafy-mix',
      uri: `at://${did}/io.paperwing.mix/${rkey}`,
      value: {
        name: 'Mixed reading',
        sources: [
          { kind: 'standard', url: 'https://writer.example' },
          { kind: 'bskyFeed', uri },
        ],
      },
    })
    net
      .get('https://public.api.bsky.app')
      .intercept({ path: `/xrpc/app.bsky.feed.getFeed?feed=${encodeURIComponent(uri)}&limit=40` })
      .reply(200, { feed: [{ post: { uri: post, record: { createdAt: '2026-11-01T00:00:00Z' } } }] })
    const res = await call(atproto, `/api/atproto?route=app.bsky.feed.getFeedSkeleton&feed=${encodeURIComponent(`at://${did}/app.bsky.feed.generator/pw-${rkey}`)}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ feed: [{ post }] })
  })

  it.each(['rss', 'bluesky'])('returns a retryable error through %s when every native publisher fails', async (route) => {
    const path = route === 'rss' ? `/api/rss?path=mix/${did}/${rkey}` : `/api/atproto?route=app.bsky.feed.getFeedSkeleton&feed=${encodeURIComponent(`at://${did}/app.bsky.feed.generator/pw-${rkey}`)}`
    const res = await call(route === 'rss' ? rss : atproto, path)
    expect(res.status).toBe(502)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  const headers = { 'x-forwarded-for': '203.0.113.19' }
  const bluesky = (key = rkey, author = did) => `/api/atproto?route=app.bsky.feed.getFeedSkeleton&feed=${encodeURIComponent(`at://${author}/app.bsky.feed.generator/pw-${key}`)}`

  it('charges a feed reader that reads the mix as RSS to its own allowance', async () => {
    await fanOutLimited(new Request('https://paperwing.io', { headers }), FAN_OUT_PER_MINUTE)
    const res = await call(rss, `/api/rss?path=mix/${did}/${rkey}`, { headers })
    expect(res.status).toBe(429)
    expect(res.headers.get('cache-control')).not.toContain('s-maxage')
  })

  it('charges the mix’s author, not Bluesky’s shared address, when Bluesky reads the mix', async () => {
    // Bluesky asks for every mix from a few addresses: one busy mix mustn't stall everyone else's.
    await fanOutLimited(new Request('https://paperwing.io', { headers }), FAN_OUT_PER_MINUTE)
    const res = await call(atproto, bluesky(), { headers })
    expect(res.status).not.toBe(429)
    // The cold read went on the author's allowance: 8 more than a full allowance would be over it.
    expect(await overLimit(`rd:fanout:mix:${did}`, 60, FAN_OUT_PER_MINUTE, FAN_OUT_PER_MINUTE - 7)).toBe(true)
  })

  it('serves a mix without the publications its author can’t afford, rather than failing it', async () => {
    await overLimit(`rd:fanout:mix:${did}`, 60, FAN_OUT_PER_MINUTE, FAN_OUT_PER_MINUTE)
    expect((await call(atproto, bluesky('ccccccccccccc'), { headers })).status).toBe(200)
  })

  it('caps cold reads across every Bluesky-read mix, so new accounts don’t buy new allowances', async () => {
    await overLimit('rd:fanout:mix:*', 60, MIX_FAN_OUT_PER_MINUTE, MIX_FAN_OUT_PER_MINUTE)
    const fresh = 'did:plc:dddddddddddddddddddddddd'
    expect((await call(atproto, bluesky('eeeeeeeeeeeee', fresh), { headers })).status).toBe(200)
    // Turned away at the ceiling before its author was charged anything.
    expect(await overLimit(`rd:fanout:mix:${fresh}`, 60, FAN_OUT_PER_MINUTE, FAN_OUT_PER_MINUTE)).toBe(false)
  })

  it('leaves the shared ceiling alone when the author is already over their own allowance', async () => {
    await overLimit(`rd:fanout:mix:${did}`, 60, FAN_OUT_PER_MINUTE, FAN_OUT_PER_MINUTE)
    await call(atproto, bluesky('ggggggggggggg'), { headers })
    expect(await overLimit('rd:fanout:mix:*', 60, MIX_FAN_OUT_PER_MINUTE, MIX_FAN_OUT_PER_MINUTE)).toBe(false)
  })

  it('keeps a mix served without a publication for a minute, so it fills in once there’s room', async () => {
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

  it('keeps a mix that went without nothing for the full ten minutes', async () => {
    const uri = `at://${did}/app.bsky.feed.generator/whole`
    vi.mocked(getRecord).mockResolvedValueOnce({ cid: 'bafy-mix', uri: `at://${did}/io.paperwing.mix/hhhhhhhhhhhhh`, value: { name: 'Bluesky only', sources: [{ kind: 'bskyFeed', uri }] } })
    net
      .get('https://public.api.bsky.app')
      .intercept({ path: `/xrpc/app.bsky.feed.getFeed?feed=${encodeURIComponent(uri)}&limit=40` })
      .reply(200, { feed: [] })
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      expect((await call(atproto, bluesky('hhhhhhhhhhhhh'), { headers })).status).toBe(200)
      vi.setSystemTime(Date.now() + 61_000)
      expect(await kv().get(`rd:mixfeed:${did}:hhhhhhhhhhhhh`)).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives every did:web account on one site a single allowance between them', async () => {
    await overLimit('rd:fanout:mix:did:web:minted.example', 60, FAN_OUT_PER_MINUTE, FAN_OUT_PER_MINUTE)
    expect(await fanOutLimited({ mix: 'did:web:minted.example:u2' }, 8)).toBe(true)
    expect(await fanOutLimited({ mix: 'did:plc:pppppppppppppppppppppppp' }, 8)).toBe(false)
  })

  it('charges a publication that keeps failing once a window, not on every read', async () => {
    const payer = { mix: did }
    await expect(standardFeed('https://broken.example', undefined, payer)).rejects.toThrow()
    await expect(standardFeed('https://broken.example', undefined, payer)).rejects.toThrow()
    // One cold read charged (8): a second would leave less than this much room.
    expect(await overLimit(`rd:fanout:mix:${did}`, 60, FAN_OUT_PER_MINUTE, FAN_OUT_PER_MINUTE - 8)).toBe(false)
  })
})
