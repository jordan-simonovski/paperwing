import { describe, expect, it, vi } from 'vitest'

vi.mock('./http.js', () => ({
  fetchJson: vi.fn(async () => ({
    posts: [{ post: { id: 42, ap_id: 'https://lemmy.world/post/42', url: 'https://anildash.com/the-web-we-lost', name: 'The Web We Lost', published: '2026-11-01T00:00:00Z' } }],
  })),
}))
vi.mock('./sources.js', () => ({ rss: vi.fn(async () => []), newsSearch: vi.fn(async () => []) }))

const { linkStories } = await import('./mixfeed')

describe("a mix's link stories", () => {
  it('keys a Lemmy post the way the app does, with its discussion', async () => {
    const [s] = await linkStories([{ kind: 'lemmy', community: 'technology@lemmy.world' }])
    expect(s).toMatchObject({ key: 'lm-42', url: 'https://anildash.com/the-web-we-lost', discussionUrl: 'https://lemmy.world/post/42', hasThread: true })
  })
})
