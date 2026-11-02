import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const created: { collection: string; record: Record<string, unknown> }[] = []
vi.mock('./atproto', () => ({
  useAtproto: { getState: () => ({ did: 'did:plc:ukwly4246zmbi537o4u36pff', handle: 'me.example', scope: 'atproto repo:io.paperwing.submission?action=create blob:image/*' }) },
  canWrite: (scope: string | undefined, c: string) => (scope === undefined ? undefined : scope.includes(`repo:${c}`)),
  createRecord: async (collection: string, record: Record<string, unknown>) => {
    created.push({ collection, record })
    return { uri: `at://did:plc:ukwly4246zmbi537o4u36pff/${collection}/3m2abcdefghij`, cid: 'bafycid' }
  },
  uploadBlob: async () => ({ $type: 'blob', ref: { $link: 'bafyimg' }, mimeType: 'image/jpeg', size: 1000 }),
  deleteRecord: async () => {},
}))
vi.mock('./mastodon', () => ({ postToMastodon: async (text: string) => `https://hachyderm.io/@me/1?${encodeURIComponent(text)}` }))
vi.mock('./hnAccount', () => ({ useHn: { getState: () => ({ cookie: 'me&abcdef123456', user: 'me' }) }, hnComment: async () => {} }))
vi.mock('./facets', () => ({ facetsFor: async () => [], graphemes: (s: string) => [...s].length }))

const { shareStory } = await import('./compose')
const story = {
  key: 'ln-1',
  source: 'rss' as const,
  sourceLabel: 'Quanta',
  title: 'A new prime pattern',
  url: 'https://www.quantamagazine.org/primes',
  discussionUrl: null,
  createdAt: 0,
  hasThread: false,
}

describe('sharing a story', () => {
  beforeEach(() => {
    created.length = 0
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/feed?src=card&')) return new Response(JSON.stringify({ description: 'Mathematicians found…' }), { status: 200 })
      if (url.startsWith('/api/feed?src=cardimage')) return new Response(new Blob(['img'], { type: 'image/jpeg' }), { status: 200 })
      if (url === '/api/hn') return new Response(JSON.stringify({ url: 'https://news.ycombinator.com/item?id=9', existing: true, sent: JSON.parse(String(init?.body)) }), { status: 200 })
      return new Response('{}', { status: 404 })
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('posts to Bluesky with a link card and lists it on a PaperWing board', async () => {
    const [r] = await shareStory({ story, title: 'A new prime pattern', take: 'Lovely result', paperwing: true, board: 'science', to: ['bluesky'] })
    expect(r).toMatchObject({ network: 'bluesky', ok: true, note: 'Posted, and listed on PaperWing' })
    const post = created.find((c) => c.collection === 'app.bsky.feed.post')!.record
    expect(post.text).toBe('Lovely result')
    expect(post.embed).toMatchObject({ external: { uri: story.url, title: 'A new prime pattern', description: 'Mathematicians found…', thumb: { ref: { $link: 'bafyimg' } } } })
    const sub = created.find((c) => c.collection === 'io.paperwing.submission')!.record
    expect(sub).toMatchObject({ url: story.url, board: 'science', boardUrl: 'https://paperwing.io/b/science', site: 'https://paperwing.io' })
    expect(sub.post).toEqual({ uri: expect.stringContaining('app.bsky.feed.post'), cid: 'bafycid' })
  })
  it('goes everywhere asked, and one failure doesn’t stop the rest', async () => {
    const out = await shareStory({ story, title: 'x'.repeat(81), take: '', paperwing: false, to: ['bluesky', 'hn', 'mastodon'] })
    expect(out.map((r) => [r.network, r.ok])).toEqual([
      ['bluesky', true],
      ['hn', true],
      ['mastodon', true],
    ])
    expect(created.some((c) => c.collection === 'io.paperwing.submission')).toBe(false)
    expect(out[1].note).toMatch(/Already on Hacker News/)
    expect(out[2].url).toContain(encodeURIComponent(story.url))
  })
})
