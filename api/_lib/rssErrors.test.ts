import { describe, expect, it, vi } from 'vitest'

// A feed reader polls the same address for years: a missing feed is worth caching, a hiccup isn't.
vi.mock('./people.js', () => ({
  actorOf: (s: string) => (s.includes('.') ? s : undefined),
  person: vi.fn(async () => {
    throw new Error('fetch failed')
  }),
}))
const { GET } = await import('../rss.js')
const rss = (path: string) => GET(new Request(`https://paperwing.io/api/rss?path=${encodeURIComponent(path)}`))

describe('RSS out when something goes wrong', () => {
  it('a feed that doesn’t exist is a 404, cached a while', async () => {
    for (const path of ['nosuch/thing', 'topic/not-a-topic', 'u/not a handle']) {
      const res = await rss(path)
      expect(res.status).toBe(404)
      expect(res.headers.get('cache-control')).toMatch(/s-maxage=300/)
    }
  })

  it('a feed that exists but couldn’t be built right now is a 502, not cached', async () => {
    const res = await rss('u/someone.example')
    expect(res.status).toBe(502)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('someone or something that isn’t there upstream is a 404 too, cached: an unknown handle, a deleted mix', async () => {
    const { person } = await import('./people.js')
    vi.mocked(person).mockRejectedValueOnce(new Error('Upstream 400 for public.api.bsky.app'))
    const res = await rss('u/nobody.example')
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=300/)
  })
})
