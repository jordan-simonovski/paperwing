import { describe, expect, it, vi } from 'vitest'
import { setUpstream } from '../_lib/http.js'
import { FAN_OUT_PER_MINUTE, kv } from '../_lib/kv.js'
import { STANDARD_COLD_READ_COST } from '../_lib/standard.js'
import { call, fakeUpstreams } from './harness.js'
import { GET, SOURCES } from '../feed.js'

// The feed function end to end: a request in, upstreams faked, the answer and its headers out.

const net = fakeUpstreams()

const lobstersStory = {
  short_id: 'abc123',
  created_at: '2026-11-01T10:00:00Z',
  title: 'A tiny Lisp in 500 lines',
  url: 'https://example.com/lisp',
  score: 42,
  comment_count: 7,
  description: '',
  submitter_user: 'ana',
  tags: ['lisp'],
  comments_url: 'https://lobste.rs/s/abc123',
}

const rssXml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title>
<item><title>Hello &amp; welcome</title><link>https://blog.example/hello</link><pubDate>Sun, 01 Nov 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Hi&lt;/p&gt;</description></item>
</channel></rss>`

describe('the feed function', () => {
  it('answers each source as JSON, cached at the edge for as long as that source allows', async () => {
    net.get('https://lobste.rs').intercept({ path: '/hottest.json' }).reply(200, [lobstersStory])
    const res = await call<{ key: string; title: string }[]>(GET, '/api/feed?src=lobsters')
    expect(res.status).toBe(200)
    expect(res.body.map((s) => [s.key, s.title])).toEqual([['lb-abc123', 'A tiny Lisp in 500 lines']])
    expect(res.headers.get('cache-control')).toContain(`s-maxage=${SOURCES.lobsters.ttl}`)
  })

  it('lets a board’s details go stale for a minute or two at most: its owner checks their changes', () => {
    expect(SOURCES.boardinfo).toMatchObject({ ttl: 60, stale: 60 })
  })

  it('lets the board list go stale for a minute or two at most: a new board is looked for straight away', async () => {
    net
      .get('https://constellation.microcosm.blue')
      .intercept({ path: (p) => p.startsWith('/links?') })
      .reply(200, { linking_records: [], cursor: null })
    const res = await call(GET, '/api/feed?src=boards')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=60, stale-while-revalidate=60')
  })

  it('says so when the board index can’t be read, rather than serving (and caching) no boards', async () => {
    net
      .get('https://constellation.microcosm.blue')
      .intercept({ path: (p) => p.startsWith('/links?') })
      .reply(503, 'busy')
    const res = await call(GET, '/api/feed?src=boards')
    expect(res.status).toBe(502)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('reads a publisher’s feed, following its redirect', async () => {
    net
      .get('https://blog.example')
      .intercept({ path: '/feed' })
      .reply(301, '', { headers: { location: 'https://www.blog.example/feed.xml' } })
    net
      .get('https://www.blog.example')
      .intercept({ path: '/feed.xml' })
      .reply(200, rssXml, { headers: { 'content-type': 'application/rss+xml' } })
    const res = await call<{ title: string; url: string }[]>(GET, '/api/feed?src=rss&url=https://blog.example/feed&label=Blog')
    expect(res.status).toBe(200)
    expect(res.body[0]).toMatchObject({ title: 'Hello & welcome', url: 'https://blog.example/hello' })
  })

  it('never fetches a private address, whoever asks', async () => {
    const restore = setUpstream({ lookup: async () => ['10.0.0.5'] })
    try {
      const res = await call<{ error: string }>(GET, '/api/feed?src=rss&url=https://intranet.example/feed')
      expect(res.status).toBe(502)
      expect(res.body.error).toBe('Host not allowed')
    } finally {
      restore()
    }
  })

  it('tells the caller what was missing, and refuses sources it doesn’t have', async () => {
    expect(await call(GET, '/api/feed?src=rss')).toMatchObject({ status: 400, body: { error: 'url required' } })
    expect(await call(GET, '/api/feed?src=person')).toMatchObject({ status: 400, body: { error: 'actor (a handle or DID) required' } })
    expect(await call(GET, '/api/feed?src=nope')).toMatchObject({ status: 400, body: { error: 'unknown src' } })
    expect(await call(GET, '/api/feed?src=constructor')).toMatchObject({ status: 400, body: { error: 'unknown src' } })
  })

  it('says when an upstream failed, and caches nothing', async () => {
    net.get('https://lobste.rs').intercept({ path: '/newest.json' }).reply(503, 'busy')
    const res = await call<{ error: string }>(GET, '/api/feed?src=lobsters&path=newest')
    expect(res.status).toBe(502)
    expect(res.body.error).toBe('Upstream 503 for lobste.rs')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('redirects to a preview image only for an <img>, so it can’t be used as an open redirect', async () => {
    const page = '<html><head><meta property="og:image" content="https://cdn.example/card.png"></head></html>'
    const asLink = await call(GET, '/api/feed?src=og&url=https://news.example/story')
    expect(asLink.status).toBe(204)

    net
      .get('https://news.example')
      .intercept({ path: '/story' })
      .reply(200, page, { headers: { 'content-type': 'text/html' } })
    const asImage = await call(GET, '/api/feed?src=og&url=https://news.example/story', { headers: { 'sec-fetch-dest': 'image' } })
    expect(asImage.status).toBe(302)
    expect(asImage.headers.get('location')).toBe('https://cdn.example/card.png')
  })

  it('serves a missing card picture as nothing at all, not an error', async () => {
    net
      .get('https://news.example')
      .intercept({ path: '/no-picture' })
      .reply(200, '<html></html>', { headers: { 'content-type': 'text/html' } })
    const res = await call(GET, '/api/feed?src=cardimage&url=https://news.example/no-picture')
    expect(res.status).toBe(204)
  })
})

// Sources that fan out to many other servers share one allowance per caller (FAN_OUT_PER_MINUTE),
// each costing about what it can ask of others. A one-fetch source (a feed, an icon, a card) never counts.
describe('the fan-out allowance', () => {
  const discover = (from: string) => call(GET, '/api/feed?src=discover&url=nope', { headers: { 'x-forwarded-for': from } })

  const costOf = (src: keyof typeof SOURCES, query = '') => {
    const cost = SOURCES[src].cost
    return typeof cost === 'function' ? cost(new URLSearchParams(query)) : (cost ?? 0)
  }
  const allowed = (src: keyof typeof SOURCES, query = '') => Math.floor(FAN_OUT_PER_MINUTE / costOf(src, query))

  // The app's own busiest minute must fit: a library import filling 30 links (each asks who's
  // discussing it), For you reading 20 followed people, Follow blogs looking up 6 suggestions, a
  // status channel with 5 custom pages, a releases channel of 40 projects, a few boards and notes,
  // and 5 followed Standard.site publications read cold (their charge is in the loader, not SOURCES).
  it('leaves room for the app’s own busiest minute', () => {
    const burst =
      30 * costOf('atlinks') +
      20 * costOf('person') +
      6 * costOf('discover') +
      costOf('status', 'hosts=a,b,c,d,e') +
      costOf('releases', `repos=${Array.from({ length: 40 }, (_, i) => `o/r${i}`).join(',')}`) +
      3 * costOf('notes') +
      2 * costOf('board') +
      5 * STANDARD_COLD_READ_COST
    expect(burst).toBeLessThanOrEqual(FAN_OUT_PER_MINUTE)
  })

  it('stops a caller who asks for too much fan-out, and only that caller', async () => {
    for (let i = 0; i < allowed('discover'); i++) expect((await discover('203.0.113.9')).status).not.toBe(429)
    const over = await discover('203.0.113.9')
    expect(over.status).toBe(429)
    expect(over.headers.get('cache-control')).toBe('no-store')
    expect((await discover('198.51.100.7')).status).not.toBe(429)
  })

  it('never counts a one-fetch source against it', async () => {
    for (let i = 0; i <= allowed('discover'); i++) await discover('203.0.113.9')
    net.get('https://lobste.rs').intercept({ path: '/hottest.json' }).reply(200, [lobstersStory])
    expect((await call(GET, '/api/feed?src=lobsters', { headers: { 'x-forwarded-for': '203.0.113.9' } })).status).toBe(200)
  })

  it('costs a status check more the more pages the caller names', async () => {
    const hosts = Array.from({ length: 25 }, (_, i) => `s${i}.example`).join(',')
    expect(costOf('status', `hosts=${hosts}`)).toBeGreaterThan(costOf('status'))
    const status = () => call(GET, `/api/feed?src=status&providers=x&hosts=${hosts}`, { headers: { 'x-forwarded-for': '203.0.113.9' } })
    net
      .get(/s\d+\.example/)
      .intercept({ path: '/api/v2/incidents.json' })
      .reply(200, { incidents: [] })
      .persist()
    for (let i = 0; i < allowed('status', `hosts=${hosts}`); i++) expect((await status()).status).toBe(200)
    expect((await status()).status).toBe(429)
  })

  it('refuses when the store can’t count', async () => {
    vi.spyOn(kv(), 'bump').mockRejectedValueOnce(new Error('Sync store answered 503'))
    expect((await discover('203.0.113.9')).status).toBe(429)
  })
})
