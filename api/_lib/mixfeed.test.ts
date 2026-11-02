import { describe, expect, it, vi } from 'vitest'

vi.mock('./http.js', () => ({
  fetchJson: vi.fn(async () => ({
    posts: [
      { post: { id: 42, ap_id: 'https://lemmy.world/post/42', url: 'https://anildash.com/the-web-we-lost', name: 'The Web We Lost', published: '2026-11-01T00:00:00Z' } },
      { post: { id: 43, url: 'https://example.com/a', name: 'Marked NSFW', published: '2026-11-01T00:00:00Z', nsfw: true } },
      { post: { id: 44, url: 'https://example.com/b', name: 'Removed by mods', published: '2026-11-01T00:00:00Z', removed: true } },
      { post: { id: 45, url: 'https://example.com/c', name: 'Deleted by its author', published: '2026-11-01T00:00:00Z', deleted: true } },
    ],
  })),
}))
vi.mock('./sources.js', () => ({ rss: vi.fn(async () => []), newsSearch: vi.fn(async () => []) }))

const { linkStories } = await import('./mixfeed')

describe("a mix's link stories", () => {
  it('keys a Lemmy post the way the app does, with its discussion', async () => {
    const [s] = await linkStories([{ kind: 'lemmy', community: 'technology@lemmy.world' }])
    expect(s).toMatchObject({ key: 'lm-42', url: 'https://anildash.com/the-web-we-lost', discussionUrl: 'https://lemmy.world/post/42', hasThread: true })
  })

  it('leaves out what the app hides: NSFW, removed and deleted posts', async () => {
    const stories = await linkStories([{ kind: 'lemmy', community: 'technology@lemmy.world' }])
    expect(stories.map((s) => s.key)).toEqual(['lm-42'])
  })
})
