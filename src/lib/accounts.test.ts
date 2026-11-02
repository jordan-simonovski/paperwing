import { describe, expect, it } from 'vitest'
import { commentActions, shareTargets, storyActions, storyVote, type Accounts } from './accounts'
import { comment, story } from '../test/fixtures'

// The accounts module, through its interface: given where the reader is signed in (plain facts),
// what they can do to a story or a comment, and where.

const none: Accounts = {}
const bluesky: Accounts = { bluesky: { did: 'did:plc:me', handle: 'me.example' } }
const hn: Accounts = { hn: { user: 'jordan' } }
const lemmy: Accounts = { lemmy: { user: 'jordan', instance: 'lemmy.world' } }
const mastodon: Accounts = { mastodon: { instance: 'hachyderm.io', acct: 'jordan', canPost: true, canFavourite: true } }

const hnStory = story({ key: 'hn-42', source: 'hn', author: 'pg' })
const lemmyStory = story({ key: 'lm-9@lemmy.world', source: 'lemmy', author: 'alice@lemmy.ml', discussionUrl: 'https://lemmy.world/post/9' })
const bskyStory = story({ key: 'bs-x', source: 'bluesky', sourceLabel: 'Bluesky', author: 'alice.example', ref: { uri: 'at://did:plc:alice/app.bsky.feed.post/1', cid: 'c' } })
const mdStory = story({ key: 'md-hachyderm.io-7', source: 'mastodon', author: 'alice@hachyderm.io' })

describe('what the up arrow also does', () => {
  it('votes where the story lives when signed in there, and nowhere when not', () => {
    expect(storyVote(none, hnStory)).toBeUndefined()
    expect(storyVote(hn, hnStory)).toEqual({ network: 'hn', id: '42', label: 'Upvote on Hacker News' })
    expect(storyVote(hn, lemmyStory)).toBeUndefined()
  })

  it('never votes on your own posts', () => {
    expect(storyVote(hn, story({ key: 'hn-43', source: 'hn', author: 'jordan' }))).toBeUndefined()
    expect(storyVote(lemmy, { ...lemmyStory, author: 'jordan' })).toBeUndefined()
    expect(storyVote(lemmy, { ...lemmyStory, author: 'jordan@lemmy.world' })).toBeUndefined()
    expect(storyVote(bluesky, { ...bskyStory, ref: { uri: 'at://did:plc:me/app.bsky.feed.post/2', cid: 'c' } })).toBeUndefined()
  })

  it('is a like on Bluesky, and says so for PaperWing listings', () => {
    expect(storyVote(bluesky, bskyStory)).toMatchObject({ network: 'bluesky', kind: 'like', label: 'Like on Bluesky' })
    expect(storyVote(bluesky, { ...bskyStory, sourceLabel: 'PaperWing' })?.label).toBe('Upvote on PaperWing (a Bluesky like)')
  })

  it('favourites on Mastodon only what was read through your own server', () => {
    expect(storyVote(mastodon, mdStory)).toMatchObject({ network: 'mastodon', label: 'Favourite on Mastodon' })
    expect(storyVote(mastodon, { ...mdStory, key: 'md-mastodon.social-7' })).toBeUndefined()
    expect(storyVote({ mastodon: { ...mastodon.mastodon!, canFavourite: false } }, mdStory)).toBeUndefined()
  })
})

describe('replying to a story', () => {
  it('offers a comment where you can post one', () => {
    expect(storyActions(hn, hnStory).reply).toEqual({ kind: 'hn-reply', threadKey: 'hn-42', parent: '42', story: true, to: 'pg' })
    expect(storyActions(lemmy, lemmyStory).reply).toMatchObject({ kind: 'lemmy-reply', postApId: 'https://lemmy.world/post/9' })
    expect(storyActions(none, hnStory).reply).toBeUndefined()
  })
  it('needs the post itself for a Bluesky reply', () => {
    expect(storyActions(bluesky, bskyStory).reply).toBeUndefined()
    expect(storyActions(bluesky, bskyStory, bskyStory.ref).reply).toMatchObject({ kind: 'bsky-reply', root: bskyStory.ref })
  })
  it('lets you share anything with a link once you can post somewhere', () => {
    expect(storyActions(none, hnStory).share).toBe(false)
    for (const a of [bluesky, hn, lemmy, mastodon]) expect(storyActions(a, hnStory).share).toBe(true)
    expect(storyActions(hn, story({ url: null, discussionUrl: null })).share).toBe(false)
  })
})

describe('comments', () => {
  it("lets you vote on others' comments, not your own or ones still being sent", () => {
    const rules = commentActions(lemmy, lemmyStory)!
    expect(rules.canVote(comment({ author: 'bob@lemmy.ml', url: 'https://lemmy.world/comment/1' }))).toBe(true)
    expect(rules.canVote(comment({ author: 'jordan@lemmy.world', url: 'https://lemmy.world/comment/2' }))).toBe(false)
    expect(rules.canVote(comment({ id: 'local-1', author: 'bob', url: 'https://lemmy.world/comment/3' }))).toBe(false)
    expect(commentActions(none, lemmyStory)).toBeUndefined()
  })
  it('replies to a Hacker News comment through your HN account', () => {
    expect(commentActions(hn, hnStory)!.reply(comment({ id: '77', author: 'dang' }))).toEqual({ kind: 'hn-reply', threadKey: 'hn-42', parent: '77', story: false, to: 'dang' })
  })
})

describe('sharing to networks', () => {
  const ok = (a: Accounts, s = hnStory) => Object.fromEntries(shareTargets(a, s, 1).map((t) => [t.network, t.ok]))
  it('offers each network you can post to, and says why not for the rest', () => {
    expect(ok(none)).toEqual({ bluesky: false, hn: false, mastodon: false, lemmy: false })
    expect(ok({ ...bluesky, ...mastodon, ...lemmy }, lemmyStory)).toEqual({ bluesky: true, hn: false, mastodon: true, lemmy: true })
  })
  it("doesn't resubmit a Hacker News story to Hacker News", () => {
    const t = shareTargets(hn, hnStory, 1).find((x) => x.network === 'hn')!
    expect(t).toMatchObject({ ok: false, why: 'Already on Hacker News' })
  })
  it('asks for the posting permission an older Mastodon sign-in lacks', () => {
    const t = shareTargets({ mastodon: { ...mastodon.mastodon!, canPost: false } }, hnStory, 1).find((x) => x.network === 'mastodon')!
    expect(t).toMatchObject({ ok: false, why: 'Allow posting under Settings' })
  })
  it('posts to Lemmy only once you have joined a community to post in', () => {
    expect(shareTargets(lemmy, hnStory, 0).find((x) => x.network === 'lemmy')).toMatchObject({ ok: false, why: 'Join a community first' })
  })
})
