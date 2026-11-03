import { describe, expect, it } from 'vitest'
import { setUpstream } from '../_lib/http.js'
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
