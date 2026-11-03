import { describe, expect, it, vi } from 'vitest'
import { call, fakeUpstreams, memoryStore } from '../_test/harness'
import { fanOutLimited, FAN_OUT_PER_MINUTE } from './kv'
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
  it.each(['rss', 'bluesky'])('applies the same caller budget when a mix is read through %s', async (route) => {
    const headers = { 'x-forwarded-for': '203.0.113.19' }
    await fanOutLimited(new Request('https://paperwing.io', { headers }), FAN_OUT_PER_MINUTE)
    const path = route === 'rss' ? `/api/rss?path=mix/${did}/${rkey}` : `/api/atproto?route=app.bsky.feed.getFeedSkeleton&feed=${encodeURIComponent(`at://${did}/app.bsky.feed.generator/pw-${rkey}`)}`
    const res = await call(route === 'rss' ? rss : atproto, path, { headers })
    expect(res.status).toBe(429)
    expect(res.headers.get('cache-control')).not.toContain('s-maxage')
  })
})
