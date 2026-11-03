import { describe, expect, it, vi } from 'vitest'
import { storyKey } from '../../src/lib/storyKey.js'
import { FAN_OUT_PER_MINUTE } from '../_lib/kv.js'
import { call, memoryStore } from './harness.js'

// The thread function's self posts: a body, or a clear no.
const POST = 'at://did:plc:uuuuuuuuuuuuuuuuuuuuuuuu/app.bsky.feed.post/3m2abcdefghij'
const KEY = storyKey({ kind: 'bs', uri: POST })

vi.mock('../_lib/frontpage.js', async (orig) => ({
  ...(await orig<typeof import('../_lib/frontpage.js')>()),
  getRecord: vi.fn(async (uri: string) => ({
    uri,
    cid: 'v1',
    value: { post: { uri: POST, cid: 'p' }, url: 'https://paperwing.io/t/paperwing/x', title: 'T', body: 'Hello', site: 'https://paperwing.io', createdAt: '2026-11-02T10:00:00Z' },
  })),
}))
const { GET } = await import('../thread.js')

memoryStore()

describe('a self post through the thread function', () => {
  it('answers its body and versions, cached at the edge for a minute', async () => {
    const res = await call<{ body: string; versions: unknown[] }>(GET, `/api/thread?src=paperwing&id=${KEY}`)
    expect(res.status).toBe(200)
    expect(res.body.body).toBe('Hello')
    expect(res.body.versions).toHaveLength(1)
    expect(res.headers.get('cache-control')).toContain('s-maxage=60')
  })

  it('says plainly when something isn’t a self post', async () => {
    const res = await call<{ error: string }>(GET, '/api/thread?src=paperwing&id=hn-1')
    expect(res.status).toBe(404)
  })

  it('stops anyone asking for too many at once', async () => {
    let last = 0
    for (let i = 0; i < 121; i++) last = (await call(GET, `/api/thread?src=paperwing&id=${KEY}`, { headers: { 'x-forwarded-for': '203.0.113.9' } })).status
    expect(last).toBe(429)
  })
})

describe('a Frontpage thread through the thread function', () => {
  it('counts against the caller’s fan-out allowance: it asks every commenter’s server', async () => {
    const ask = () => call(GET, '/api/thread?src=frontpage&id=fp-nope', { headers: { 'x-forwarded-for': '203.0.113.9' } })
    // A Frontpage thread costs 3 of the allowance.
    for (let i = 0; i < FAN_OUT_PER_MINUTE / 3; i++) expect((await ask()).status).not.toBe(429)
    expect((await ask()).status).toBe(429)
  })
})
