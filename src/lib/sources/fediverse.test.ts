import { describe, expect, it } from 'vitest'
import { resolveChannel } from '../channels'
import { normalizeInstance } from '../mastodon'
import { lemmyComments, lemmyStory } from './lemmy'
import { cleanHtml, mastodonComments, parseKey, quoteOf, statusStory, type Status } from './mastodon'
import { quotedPost } from '../bskyPost'

const lemmyComment = (id: number, path: string, childCount = 0) => ({
  comment: { id, content: `**c${id}**`, path, published: '2026-10-20T00:00:00Z', ap_id: `https://lemmy.world/comment/${id}`, removed: false, deleted: false },
  creator: { name: 'ann', actor_id: 'https://lemmy.world/u/ann' },
  counts: { score: id, child_count: childCount },
})

describe('lemmy', () => {
  it('builds the reply tree from paths and counts what was left out', () => {
    const tree = lemmyComments([lemmyComment(1, '0.1', 4), lemmyComment(2, '0.1.2', 1), lemmyComment(3, '0.1.2.3'), lemmyComment(4, '0.4'), lemmyComment(9, '0.8.9')])
    expect(tree.map((c) => c.id)).toEqual(['1', '4'])
    expect(tree[0].children[0].children[0].id).toBe('3')
    // Comment 1 has 4 replies in all; 2 are here (2 and 3), so 2 more live on Lemmy.
    expect(tree[0].more).toBe(2)
    expect(tree[0].html).toContain('<strong>c1</strong>')
    expect(tree[0].author).toBe('ann@lemmy.world')
  })
  it('treats an image post as the post itself, not a link out', () => {
    const post = (url: string) =>
      lemmyStory({
        post: { id: 7, name: ' Title ', url, ap_id: 'https://lemmy.world/post/7', nsfw: false, removed: false, deleted: false, published: '2026-10-20T00:00:00Z' },
        creator: { name: 'bob', actor_id: 'https://programming.dev/u/bob' },
        community: { name: 'programming', actor_id: 'https://programming.dev/c/programming' },
        counts: { score: 10, comments: 3 },
      })
    expect(post('https://x.dev/a.png')).toMatchObject({ key: 'lm-7', url: null, media: [{ kind: 'image' }], author: 'bob', sourceLabel: 'c/programming', title: 'Title' })
    expect(post('https://x.dev/article')).toMatchObject({ url: 'https://x.dev/article', media: undefined })
  })
})

const status = (o: Partial<Status>): Status => ({
  id: '1',
  created_at: '2026-10-20T00:00:00Z',
  in_reply_to_id: null,
  sensitive: false,
  spoiler_text: '',
  visibility: 'public',
  url: 'https://hachyderm.io/@a/1',
  uri: 'https://hachyderm.io/users/a/statuses/1',
  content: '<p>Hello</p>',
  account: { acct: 'a', display_name: 'A', url: '' },
  media_attachments: [],
  card: null,
  tags: [],
  replies_count: 0,
  reblogs_count: 2,
  favourites_count: 3,
  reblog: null,
  ...o,
})

describe('mastodon', () => {
  it('drops the hidden parts of long links', () => {
    expect(cleanHtml('<a href="https://x.dev/long/path"><span class="invisible">https://</span><span class="ellipsis">x.dev/lo</span><span class="invisible">ng/path</span></a>')).toBe(
      '<a href="https://x.dev/long/path">x.dev/lo…</a>',
    )
  })
  it('titles a post from its link card, else its first line', () => {
    const linked = statusStory('hachyderm.io', status({ card: { url: 'https://x.dev/post', title: 'A post', type: 'link' }, tags: [{ name: 'OpenTelemetry' }] }))
    expect(linked).toMatchObject({ key: 'md-hachyderm.io-1', url: 'https://x.dev/post', title: 'A post', score: 5, tags: ['opentelemetry'] })
    expect(statusStory('hachyderm.io', status({ content: '<p>First line<br>second</p>' })).title).toBe('First line')
  })
  it('reads a boost as the boosted post', () => {
    expect(statusStory('hachyderm.io', status({ id: '9', reblog: status({ id: '5', content: '<p>Original</p>' }) }))).toMatchObject({ key: 'md-hachyderm.io-5', title: 'Original' })
  })
  it('threads replies under the post they answer', () => {
    const tree = mastodonComments([status({ id: '2', in_reply_to_id: '1' }), status({ id: '3', in_reply_to_id: '2' }), status({ id: '4', in_reply_to_id: '1' })], '1')
    expect(tree.map((c) => c.id)).toEqual(['2', '4'])
    expect(tree[0].children[0].id).toBe('3')
  })
  it('keeps the server in the key', () => {
    expect(parseKey('md-hachyderm.io-117512')).toEqual({ instance: 'hachyderm.io', id: '117512' })
    expect(parseKey('md-my-server.social-42')).toEqual({ instance: 'my-server.social', id: '42' })
  })
  it('accepts a server however it is typed', () => {
    for (const s of ['hachyderm.io', 'https://hachyderm.io/@me', '@me@hachyderm.io', 'me@Hachyderm.io ']) expect(normalizeInstance(s)).toBe('hachyderm.io')
  })
})

describe('for you', () => {
  const ctx = { followed: ['observability', 'ai'], interests: [], customFeeds: [] }
  it('brings in the people you follow, kept to your topics, once you sign in', () => {
    const home = (signedIn: boolean) => resolveChannel('for-you', undefined, { ...ctx, mastodon: signedIn })!.feeds.filter((f) => f.kind === 'mastodon')
    expect(home(false)).toEqual([])
    expect(home(true)).toEqual([{ kind: 'mastodon', feed: 'home', topics: ['observability', 'ai'] }])
  })
})

describe('quote posts', () => {
  it('reads a Mastodon quote once its author allowed it, and nothing while pending', () => {
    const quoted = status({ id: '9', content: '<p>The original</p>', account: { acct: 'b@x.social', display_name: 'B', url: '' } })
    const story = statusStory('hachyderm.io', status({ content: '<p>Quoting this</p><p class="quote-inline">RE: https://x.social/@b/9</p>', quote: { state: 'accepted', quoted_status: quoted } }))
    expect(story.text).toBe('<p>Quoting this</p>')
    expect(story.quote).toMatchObject({ key: 'md-hachyderm.io-9', author: 'b@x.social', name: 'B', html: '<p>The original</p>' })
    expect(quoteOf('h', status({ quote: { state: 'pending', quoted_status: null } }))).toBeUndefined()
    expect(quoteOf('h', status({ quote: { state: 'deleted', quoted_status: null } }))).toEqual({ author: '', html: '', gone: true })
  })

  it('reads a Bluesky quote, with or without media, and marks deleted ones', () => {
    const viewRecord = {
      $type: 'app.bsky.embed.record#viewRecord',
      uri: 'at://did:plc:abc/app.bsky.feed.post/3kq',
      author: { handle: 'b.bsky.social', displayName: 'B' },
      value: { text: 'The original\n\nhttps://example.com', createdAt: '2026-10-30T00:00:00Z' },
      embeds: [{ $type: 'app.bsky.embed.external#view', external: { uri: 'https://example.com/post', title: 'A post' } }],
    }
    const q = quotedPost({ record: { text: 'My take' }, embed: { $type: 'app.bsky.embed.record#view', record: viewRecord } })
    expect(q).toMatchObject({ author: 'b.bsky.social', name: 'B', url: 'https://bsky.app/profile/b.bsky.social/post/3kq', link: { url: 'https://example.com/post', title: 'A post' } })
    expect(q?.key).toBe('bs-YXQ6Ly9kaWQ6cGxjOmFiYy9hcHAuYnNreS5mZWVkLnBvc3QvM2tx')
    expect(q?.html).toContain('<a href="https://example.com">')
    const withMedia = quotedPost({
      record: { text: '' },
      embed: { $type: 'app.bsky.embed.recordWithMedia#view', record: { $type: 'app.bsky.embed.record#view', record: viewRecord }, media: { $type: 'app.bsky.embed.images#view', images: [] } },
    })
    expect(withMedia?.author).toBe('b.bsky.social')
    expect(quotedPost({ record: { text: '' }, embed: { $type: 'app.bsky.embed.record#view', record: { $type: 'app.bsky.embed.record#viewNotFound' } } })).toEqual({ author: '', html: '', gone: true })
    // A quoted feed or list isn't a post.
    expect(quotedPost({ record: { text: '' }, embed: { $type: 'app.bsky.embed.record#view', record: { $type: 'app.bsky.feed.defs#generatorView' } } })).toBeUndefined()
  })
})
