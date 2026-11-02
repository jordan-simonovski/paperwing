import { describe, expect, it, vi } from 'vitest'

const URL_ = 'https://sidbala.com/h-264-is-magic/'
const post = (rkey: string, replies: number, likes = 0) => ({
  uri: `at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/app.bsky.feed.post/${rkey}`,
  cid: `cid${rkey}`,
  author: { did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', handle: 'alice.example' },
  record: { text: `Post ${rkey}`, createdAt: '2026-10-30T10:00:00Z' },
  replyCount: replies,
  likeCount: likes,
  indexedAt: '2026-10-30T10:00:00Z',
})
const asked: string[] = []
vi.mock('./frontpage.js', () => ({ frontpageStories: async (uris: string[]) => uris.map((u) => ({ key: 'fp-' + u, source: 'frontpage', title: 'On Frontpage', comments: 1 })) }))
vi.mock('./http.js', async (orig) => ({
  ...(await orig<typeof import('./http.js')>()),
  fetchJson: async (url: string) => {
    asked.push(url)
    const u = new URL(url)
    const target = u.searchParams.get('target')
    if (u.pathname === '/links/all')
      return target === URL_
        ? {
            links: {
              'app.bsky.feed.post': {
                '.embed.external.uri': { records: 2, distinct_dids: 2 },
                '.facets[].features[app.bsky.richtext.facet#link].uri': { records: 1, distinct_dids: 1 },
                '.text': { records: 1, distinct_dids: 1 },
              },
              'fyi.unravel.frontpage.post': { '.url': { records: 1, distinct_dids: 1 } },
              'app.techne.thread': { '.storyUrl': { records: 1, distinct_dids: 1 } },
            },
          }
        : { links: {} }
    if (u.pathname === '/links') {
      const col = u.searchParams.get('collection')
      const path = u.searchParams.get('path')
      if (col === 'fyi.unravel.frontpage.post') return { linking_records: [{ did: 'did:plc:b', collection: col, rkey: 'fp1' }] }
      return {
        linking_records:
          path === '.embed.external.uri'
            ? [
                { did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', collection: col, rkey: 'p1' },
                { did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', collection: col, rkey: 'p2' },
              ]
            : [{ did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', collection: col, rkey: 'p3' }],
      }
    }
    if (u.pathname === '/xrpc/app.bsky.feed.getPosts') return { posts: [post('p1', 0, 50), post('p2', 4), post('p3', 9)] }
    throw new Error(`unexpected ${url}`)
  },
}))

describe('open-network discussions', () => {
  it('finds Bluesky posts (cards and text links) and Frontpage posts, keeping those with replies, busiest first', async () => {
    const { openNetworkDiscussions } = await import('./atlinks')
    const found = await openNetworkDiscussions(URL_)
    expect(found.map((s) => [s.source, s.comments])).toEqual([
      ['frontpage', 1],
      ['bluesky', 9],
      ['bluesky', 4],
    ])
    // Only the paths that are links: not '.text', not other apps' records.
    expect(asked.some((a) => a.includes('path=.text'))).toBe(false)
    expect(asked.some((a) => a.includes('app.techne'))).toBe(false)
  })

  it('refuses things that are not web links', async () => {
    const { openNetworkDiscussions } = await import('./atlinks')
    await expect(openNetworkDiscussions('javascript:alert(1)')).rejects.toThrow()
  })
})
