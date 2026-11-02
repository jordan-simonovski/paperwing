import { describe, expect, it, vi } from 'vitest'

const A = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
const B = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb'
const POST = `at://${A}/fyi.unravel.frontpage.post/3mz5u5emjm22a`
const NEWPOST = `at://${A}/fyi.frontpage.feed.post/3mz7ixzjg6b2p`
const C1 = `at://${B}/fyi.unravel.frontpage.comment/3ljivixecy42a`
const C2 = `at://${A}/fyi.frontpage.feed.comment/3ljivixecy42b`
const records: Record<string, unknown> = {
  [POST]: { uri: POST, cid: 'cidpost', value: { title: 'Why atproto', url: 'https://example.com/atproto', createdAt: '2026-10-30T10:00:00Z' } },
  [NEWPOST]: { uri: NEWPOST, cid: 'cidnew', value: { title: 'New style', subject: { url: 'https://blog.example/p', $type: 'fyi.frontpage.feed.post#urlSubject' }, createdAt: '2026-10-31T10:00:00Z' } },
  [C1]: { uri: C1, cid: 'cid1', value: { content: 'First!\n\nSee https://x.dev/a.', post: { uri: POST, cid: 'cidpost' }, createdAt: '2026-10-30T11:00:00Z' } },
  [C2]: {
    uri: C2,
    cid: 'cid2',
    value: {
      blocks: [{ content: { $type: 'fyi.frontpage.richtext.block#plaintextParagraph', text: 'A <reply>' } }],
      parent: { uri: C1, cid: 'cid1' },
      post: { uri: POST, cid: 'cidpost' },
      createdAt: '2026-10-30T12:00:00Z',
    },
  },
}
vi.mock('./http.js', async (orig) => ({
  ...(await orig<typeof import('./http.js')>()),
  fetchJson: async (url: string) => {
    const u = new URL(url)
    if (u.host === 'frontpage.fyi') return { feed: [{ post: POST }, { post: NEWPOST }, { post: 'at://evil/x/y' }] }
    if (u.host === 'plc.directory') return { service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example' }] }
    if (u.host === 'pds.example') {
      const uri = `at://${u.searchParams.get('repo')}/${u.searchParams.get('collection')}/${u.searchParams.get('rkey')}`
      if (records[uri]) return records[uri]
      throw new Error('404')
    }
    if (u.pathname === '/links/all') {
      const t = u.searchParams.get('target')
      if (t === POST)
        return {
          links: {
            'fyi.unravel.frontpage.vote': { '.subject.uri': { records: 25, distinct_dids: 24 } },
            'fyi.unravel.frontpage.comment': { '.post.uri': { records: 2, distinct_dids: 2 }, '.parent.uri': { records: 1, distinct_dids: 1 } },
          },
        }
      if (t === C1) return { links: { 'fyi.frontpage.feed.vote': { '.subject.uri': { records: 3, distinct_dids: 3 } } } }
      return { links: {} }
    }
    if (u.pathname === '/links') {
      const col = u.searchParams.get('collection')
      const list = col === 'fyi.unravel.frontpage.comment' ? [{ did: B, collection: col, rkey: '3ljivixecy42a' }] : [{ did: A, collection: col, rkey: '3ljivixecy42b' }]
      return { linking_records: list, cursor: null }
    }
    if (u.host === 'public.api.bsky.app')
      return {
        profiles: [
          { did: A, handle: 'alice.example' },
          { did: B, handle: 'handle.invalid' },
        ],
      }
    throw new Error(`unexpected ${url}`)
  },
}))

describe('Frontpage', () => {
  it('reads a feed: records from authors, verified handles, distinct voters, both namespaces', async () => {
    const { frontpageFeed } = await import('./frontpage')
    const stories = await frontpageFeed('hot')
    expect(stories).toHaveLength(2)
    expect(stories[0]).toMatchObject({
      source: 'frontpage',
      title: 'Why atproto',
      url: 'https://example.com/atproto',
      author: 'alice.example',
      score: 25,
      comments: 2,
      ref: { uri: POST, cid: 'cidpost' },
      site: 'example.com',
    })
    expect(stories[0].discussionUrl).toBe('https://frontpage.fyi/post/alice.example/3mz5u5emjm22a')
    expect(stories[1]).toMatchObject({ title: 'New style', url: 'https://blog.example/p', score: 1, comments: 0 })
  })

  it('builds a thread from both comment formats, nested by parent, unverified handles shown as DIDs', async () => {
    const { frontpageThread, frontpageKey } = await import('./frontpage')
    const t = await frontpageThread(frontpageKey(POST))
    expect(t.comments).toHaveLength(1)
    expect(t.comments[0]).toMatchObject({ author: B, score: 3, ref: { uri: C1, cid: 'cid1' } })
    expect(t.comments[0].html).toBe('<p>First!</p><p>See <a href="https://x.dev/a">https://x.dev/a</a>.</p>')
    expect(t.comments[0].children[0]).toMatchObject({ author: 'alice.example', html: '<p>A &lt;reply&gt;</p>' })
  })

  it('refuses keys that are not Frontpage posts', async () => {
    const { frontpageThread } = await import('./frontpage')
    await expect(frontpageThread('fp-' + Buffer.from('at://did:plc:x/app.bsky.feed.post/1').toString('base64url'))).rejects.toThrow('Not a Frontpage post')
  })
})
