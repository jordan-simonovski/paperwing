import { beforeEach, describe, expect, it, vi } from 'vitest'

// The networks are the boundary: fetchJson answers by URL, and records what was asked.
const asked: string[] = []
vi.mock('./http.js', () => ({
  assertPublicUrl: async () => {},
  fetchJson: async (url: string) => {
    asked.push(url)
    // A server that never answers (a tarpit): only the overall budget gets past it.
    if (url.includes('tarpit.example')) return new Promise(() => {})
    if (url.includes('firebaseio')) return { descendants: 12 }
    if (url.includes('/api/v1/statuses/')) return { replies_count: 4 }
    if (url.includes('getPosts')) return { posts: [{ replyCount: 7 }] }
    if (url.includes('/api/v3/post')) return { post_view: { counts: { comments: 3 } } }
    throw new Error('unexpected ' + url)
  },
}))
const { commentCount, commentCounts } = await import('./threadCounts')
const { storyKey } = await import('../../src/lib/storyKey.js')

beforeEach(() => void (asked.length = 0))

describe('comment counts', () => {
  it('asks each network for its own thread', async () => {
    expect(await commentCount('hn-42')).toBe(12)
    expect(await commentCount('lm-9@lemmy.world')).toBe(3)
    expect(await commentCount(storyKey({ kind: 'bs', uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz' }))).toBe(7)
    expect(asked[1]).toBe('https://lemmy.world/api/v3/post?id=9')
  })
  it('reads a Mastodon status from its own server, hyphens in the name and all', async () => {
    expect(await commentCount('md-mastodon-staging.example.org-1130')).toBe(4)
    expect(asked).toEqual(['https://mastodon-staging.example.org/api/v1/statuses/1130'])
  })
  it("doesn't fetch anything for a key it can't read", async () => {
    expect(await commentCount('bs-%%%')).toBeUndefined()
    expect(asked).toEqual([])
  })
})

describe('counting many threads for an alert run', () => {
  it('stops at its time budget with what it has, however slow the servers watched threads live on', async () => {
    const keys = [...Array.from({ length: 40 }, (_, i) => `md-tarpit.example-${i}`), 'hn-42']
    const start = Date.now()
    const counts = await commentCounts(keys, { budgetMs: 100 })
    expect(Date.now() - start).toBeLessThan(1000)
    // The slow server holds up only its own threads.
    expect(counts.get('hn-42')).toBe(12)
  })
})
