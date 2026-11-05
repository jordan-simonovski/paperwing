import { afterEach, describe, expect, it, vi } from 'vitest'

const post = (rkey: string, handle: string, link: string | undefined, likes = 0, reply = false) => ({
  uri: `at://did:plc:${handle.replace(/\W/g, '').padEnd(24, 'x').slice(0, 24)}/app.bsky.feed.post/${rkey}`,
  cid: `c${rkey}`,
  author: { handle },
  record: { text: `post ${rkey}`, createdAt: '2026-10-31T10:00:00Z', ...(reply ? { reply: {} } : {}) },
  embed: link ? { $type: 'app.bsky.embed.external#view', external: { uri: link, title: `Title for ${link}` } } : undefined,
  likeCount: likes,
  replyCount: 0,
  indexedAt: '2026-10-31T10:00:00Z',
})

/** A quote post: its own words, embedding another post (which shares a link) as the record view carries it. */
const quote = (rkey: string, handle: string, text: string, quoted: ReturnType<typeof post>) => ({
  ...post(rkey, handle, undefined, 4),
  record: { text, createdAt: '2026-10-31T11:00:00Z' },
  replyCount: 7,
  embed: {
    $type: 'app.bsky.embed.record#view',
    record: { $type: 'app.bsky.embed.record#viewRecord', uri: quoted.uri, author: quoted.author, value: quoted.record, embeds: quoted.embed ? [quoted.embed] : [] },
  },
})

vi.mock('../atproto', () => ({
  appview: async () => ({
    feed: [
      { post: post('1', 'alice.example', 'https://example.com/a?utm=x', 3) },
      { post: post('2', 'bob.example', 'https://www.example.com/a/', 10) },
      { post: post('2', 'bob.example', 'https://www.example.com/a/', 10), reason: { $type: 'app.bsky.feed.defs#reasonRepost', by: { handle: 'carol.example' } } },
      { post: post('3', 'dan.example', undefined, 50) },
      { post: post('4', 'erin.example', 'https://other.dev/x', 1, true) },
      { post: post('5', 'erin.example', 'https://other.dev/y', 1) },
      // Frank replies under Alice's post about /a: he's discussing it.
      { post: post('6', 'frank.example', undefined, 0, true), reply: { root: post('1', 'alice.example', 'https://example.com/a?utm=x', 3) } },
      // Alice also replies there, but she shared it: she stays a sharer.
      { post: post('7', 'alice.example', undefined, 0, true), reply: { root: post('1', 'alice.example', 'https://example.com/a?utm=x', 3) } },
      // Gina quotes Alice's post with words of her own: a conversation of hers about /a.
      { post: quote('8', 'gina.example', 'This is the part everyone is missing', post('1', 'alice.example', 'https://example.com/a?utm=x', 3)) },
    ],
  }),
  useAtproto: { getState: () => ({ did: 'did:plc:me' }) },
}))

afterEach(() => vi.unstubAllGlobals())

describe('Bluesky following', () => {
  it('keeps link posts, one story per link, with everyone who shared it, led by the busiest post', async () => {
    const { blueskyFollowing } = await import('./bluesky')
    const stories = await blueskyFollowing()
    expect(stories.map((s) => [s.url, s.sharedBy, s.score])).toEqual([
      ['https://www.example.com/a/', ['alice.example', 'bob.example', 'carol.example'], 10],
      ['https://other.dev/y', ['erin.example'], 1],
    ])
    expect(stories.every((s) => s.followed)).toBe(true)
  })

  it('knows how each person you follow took part, quotes first, each person once', async () => {
    const { friendsByLink, linkId } = await import('./bluesky')
    const friends = await friendsByLink()
    expect(friends[linkId('https://example.com/a')]?.map((f) => [f.handle, f.how])).toEqual([
      ['gina.example', 'quoted'],
      ['alice.example', 'posted'],
      ['bob.example', 'posted'],
      ['frank.example', 'replied'],
      ['carol.example', 'reposted'],
    ])
    expect(friends[linkId('https://other.dev/y')]?.map((f) => f.handle)).toEqual(['erin.example'])
  })

  it('keeps each person’s own post to open, but not a repost, which isn’t theirs', async () => {
    const { friendsByLink, linkId } = await import('./bluesky')
    const { bskyKeyOf } = await import('../bskyPost')
    const byHandle = Object.fromEntries((await friendsByLink())[linkId('https://example.com/a')].map((f) => [f.handle, f]))
    expect(byHandle['gina.example']).toMatchObject({ post: bskyKeyOf(post('8', 'gina.example', undefined).uri), text: 'This is the part everyone is missing', replies: 7 })
    expect(byHandle['frank.example'].post).toBe(bskyKeyOf(post('6', 'frank.example', undefined).uri))
    expect(byHandle['carol.example'].post).toBeUndefined()
  })
})

describe('Bluesky feeds and lists', () => {
  it('turns bsky.app links into feed and list URIs with their names', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const u = String(url)
      const body = u.includes('resolveHandle')
        ? { did: 'did:plc:abc' }
        : u.includes('getFeedGenerator')
          ? { view: { displayName: 'Tech news' } }
          : u.includes('getList')
            ? { list: { name: 'SREs' } }
            : {}
      return new Response(JSON.stringify(body), { status: 200 })
    })
    const { resolveBlueskyFeed } = await import('./bluesky')
    expect(await resolveBlueskyFeed('https://bsky.app/profile/someone.bsky.social/feed/tech')).toEqual({ uri: 'at://did:plc:abc/app.bsky.feed.generator/tech', name: 'Tech news' })
    expect(await resolveBlueskyFeed('bsky.app/profile/did:plc:xyz/lists/3kabc')).toEqual({ uri: 'at://did:plc:xyz/app.bsky.graph.list/3kabc', name: 'SREs' })
    await expect(resolveBlueskyFeed('https://example.com')).rejects.toThrow('Paste a bsky.app link')
  })
})

describe('a PaperWing post read from Bluesky', () => {
  const author = { did: 'did:plc:writer', handle: 'writer.example' }
  const base = (uri: string, extra: object) =>
    ({ uri, cid: 'bafy', author, record: { text: '', createdAt: '2026-11-01T00:00:00Z' }, indexedAt: '2026-11-01T00:00:00Z', likeCount: 0, replyCount: 0, ...extra }) as never

  it('is shown as PaperWing’s own, not as a Bluesky post', async () => {
    const { postStory } = await import('./bluesky')
    const { selfPostUrl } = await import('../paperwing')
    const uri = 'at://did:plc:writer/app.bsky.feed.post/3kself'
    const own = postStory(
      base(uri, {
        record: { text: 'Notes on bread', createdAt: '2026-11-01T00:00:00Z' },
        embed: { $type: 'app.bsky.embed.external#view', external: { uri: selfPostUrl(uri), title: 'Notes on bread' } },
      }),
    )
    expect(own.sourceLabel).toBe('PaperWing')
    // The thread still lives on Bluesky.
    expect(own.source).toBe('bluesky')
  })

  it('leaves an ordinary Bluesky post as Bluesky', async () => {
    const { postStory } = await import('./bluesky')
    const post = postStory(base('at://did:plc:writer/app.bsky.feed.post/3kplain', { record: { text: 'Just a thought', createdAt: '2026-11-01T00:00:00Z' } }))
    expect(post.sourceLabel).toBe('Bluesky')
  })
})
