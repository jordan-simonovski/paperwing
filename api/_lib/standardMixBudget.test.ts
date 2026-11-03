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
    const shared = await call(atproto, bluesky(), { headers: { 'x-forwarded-for': '198.51.100.7' } })
    expect(shared.status).not.toBe(429)

    await fanOutLimited(`mix:${did}`, FAN_OUT_PER_MINUTE)
    // Another of the author's mixes, so the first one's cached feed isn't what answers.
    const spent = await call(atproto, bluesky('ccccccccccccc'), { headers: { 'x-forwarded-for': '198.51.100.8' } })
    expect(spent.status).toBe(429)
  })
})
