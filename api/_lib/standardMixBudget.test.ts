import { describe, expect, it, vi } from 'vitest'
import { call, fakeUpstreams, memoryStore } from '../_test/harness'
import { fanOutLimited, FAN_OUT_PER_MINUTE } from './kv'
import { GET as rss } from '../rss'
import { GET as atproto } from '../atproto'
import { getRecord } from './frontpage'

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

  it.each(['rss', 'bluesky'])('applies the same caller budget when a mix is read through %s', async (route) => {
    const headers = { 'x-forwarded-for': '203.0.113.19' }
    await fanOutLimited(new Request('https://paperwing.io', { headers }), FAN_OUT_PER_MINUTE)
    const path = route === 'rss' ? `/api/rss?path=mix/${did}/${rkey}` : `/api/atproto?route=app.bsky.feed.getFeedSkeleton&feed=${encodeURIComponent(`at://${did}/app.bsky.feed.generator/pw-${rkey}`)}`
    const res = await call(route === 'rss' ? rss : atproto, path, { headers })
    expect(res.status).toBe(429)
    expect(res.headers.get('cache-control')).not.toContain('s-maxage')
  })
})
