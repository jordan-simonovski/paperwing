import { describe, expect, it } from 'vitest'
import { planChannel, rankChannel, rankStories, type Reader } from './channelFeed'
import { story, testReader } from '../test/fixtures'

// The channel feed module, tested only through its interface: a reader (everything about them a
// channel depends on), a channel id, and the stories each planned feed brought back.

const reader = testReader

const kinds = (r: Reader, id: string, opts = {}) => planChannel(r, id, { sort: 'hot', blueskyEnabled: true, ...opts })!.feeds.map((f) => f.ref)

describe('planning For you', () => {
  it('reads the Mastodon home timeline, kept to your topics, once you sign in', () => {
    const r = reader({ followed: ['observability', 'ai'] })
    expect(kinds(r, 'for-you').filter((f) => f.kind === 'mastodon')).toEqual([])
    const signedIn = reader({ followed: ['observability', 'ai'], mastodon: { instance: 'hachyderm.io', signedIn: true } })
    expect(kinds(signedIn, 'for-you').filter((f) => f.kind === 'mastodon')).toEqual([{ kind: 'mastodon', feed: 'home', topics: ['observability', 'ai'] }])
  })

  it('reads what the people you follow list on PaperWing', () => {
    const r = reader({ followed: ['web'], people: [{ did: 'did:plc:abc', handle: 'anil.example' }] })
    expect(kinds(r, 'for-you')).toContainEqual({ kind: 'person', actor: 'did:plc:abc', label: '@anil.example' })
  })

  it("leaves Bluesky's feeds out until the deployment says it can serve them", () => {
    const r = reader({ followed: ['web'] })
    expect(kinds(r, 'for-you', { blueskyEnabled: true }).some((f) => f.kind === 'bluesky')).toBe(true)
    expect(kinds(r, 'for-you', { blueskyEnabled: false }).some((f) => f.kind === 'bluesky')).toBe(false)
  })
})

describe('boards in For you', () => {
  // Valid board addresses: a 24-letter base32 DID and a 13-letter record key.
  const letters = 'abcdefghijklmnopqrstuvwxyz234567'
  const boards = Array.from({ length: 12 }, (_, i) => ({ uri: `at://did:plc:${letters[i].repeat(24)}/io.paperwing.board/3m2board${letters[i].repeat(5)}`, name: `Board ${i}` }))

  it('suggests posts from boards you haven’t joined, unless you’ve turned that off', () => {
    expect(kinds(reader({ followed: ['web'] }), 'for-you')).toContainEqual({ kind: 'boardpicks' })
    expect(kinds(reader({ followed: ['web'], boardPicks: false }), 'for-you')).not.toContainEqual({ kind: 'boardpicks' })
  })

  it('brings in the posts of the boards you’ve joined: the ten you joined last', () => {
    const planned = kinds(reader({ followed: ['web'], boards }), 'for-you').filter((f) => f.kind === 'board')
    expect(planned).toHaveLength(10)
    expect(planned[0]).toEqual({ kind: 'board', did: `did:plc:${'c'.repeat(24)}`, rkey: '3m2boardccccc', sort: 'hot', name: 'Board 2' })
  })
})

describe('ranking For you with boards and announcements', () => {
  const JOINED = 'at://did:plc:owner/io.paperwing.board/3m2joinedaaaa'
  const OTHER = 'at://did:plc:other/io.paperwing.board/3m2otheraaaaa'
  const ANNOUNCEMENTS = 'at://did:plc:pw/io.paperwing.board/3m2newsaaaaaa'
  const front = [
    story({ key: 'bs-news', title: 'Welcome to PaperWing', url: null, pinned: true, board: { uri: ANNOUNCEMENTS, name: 'Announcements', official: true } }),
    story({ key: 'hn-1', title: 'A tiny Lisp in 500 lines', url: 'https://a.example/lisp' }),
  ]
  const picks = [
    story({ key: 'bs-joined', title: 'Sourdough starters compared', url: 'https://a.example/sourdough', recommended: true, board: { uri: JOINED, name: 'Joined', official: false } }),
    story({ key: 'bs-other', title: 'Rewiring a 1960s caravan', url: 'https://a.example/caravan', recommended: true, board: { uri: OTHER, name: 'Other', official: false } }),
  ]
  // What a joined board's own feed brings (the app tags each story with its board).
  const fromBoard = (uri: string, official = false) => [
    story({ key: `bs-on-${uri.slice(-5)}`, title: `A post on ${uri.slice(-5)}`, url: `https://a.example/${uri.slice(-5)}`, board: { uri, name: 'B', official } }),
  ]
  const rankedStories = (r: Reader, id = 'for-you', boardFeed: (uri: string) => ReturnType<typeof story>[] = () => []) => {
    const plan = planChannel(r, id, { sort: 'hot', blueskyEnabled: false })!
    return rankChannel(
      plan,
      r,
      plan.feeds.map((f) => (f.ref.kind === 'paperwing' ? front : f.ref.kind === 'boardpicks' ? picks : f.ref.kind === 'board' ? boardFeed(`at://${f.ref.did}/io.paperwing.board/${f.ref.rkey}`) : [])),
    )
  }
  const ranked = (r: Reader, id = 'for-you') => rankedStories(r, id).map((s) => s.key)

  it('stops calling a board’s posts suggestions once you’ve joined it, without them leaving the screen', () => {
    const rows = rankedStories(reader({ followed: ['web'], boards: [{ uri: JOINED, name: 'Joined' }] }))
    expect(rows.find((s) => s.key === 'bs-other')?.recommended).toBe(true)
    expect(rows.find((s) => s.key === 'bs-joined')).toMatchObject({ board: { uri: JOINED } })
    expect(rows.find((s) => s.key === 'bs-joined')?.recommended).toBeUndefined()
  })

  it('keeps a joined official board’s posts out of For you too, once announcements are off', () => {
    const NEWS = 'at://did:plc:pwpwpwpwpwpwpwpwpwpwpwpw/io.paperwing.board/3m2newsaaaaaa'
    const r = reader({ followed: ['web'], boards: [{ uri: NEWS, name: 'Announcements' }], announcements: false })
    expect(rankedStories(r, 'for-you', (uri) => fromBoard(uri, true)).some((s) => s.board?.uri === NEWS)).toBe(false)
    const on = reader({ followed: ['web'], boards: [{ uri: NEWS, name: 'Announcements' }] })
    expect(rankedStories(on, 'for-you', (uri) => fromBoard(uri, true)).some((s) => s.board?.uri === NEWS)).toBe(true)
  })

  it('leaves out an announcement past its pinned days too, but keeps it unpinned on the front page', () => {
    const old = story({ key: 'bs-old', title: 'Boards are here', url: null, board: { uri: ANNOUNCEMENTS, name: 'Announcements', official: true } })
    const r = reader({ followed: ['web'], announcements: false })
    const plan = planChannel(r, 'for-you', { sort: 'hot', blueskyEnabled: false })!
    expect(
      rankChannel(
        plan,
        r,
        plan.feeds.map((f) => (f.ref.kind === 'paperwing' ? [old] : [])),
      ).map((s) => s.key),
    ).not.toContain('bs-old')
    const frontPlan = planChannel(r, 'paperwing', { sort: 'hot', blueskyEnabled: false })!
    expect(rankChannel(frontPlan, r, [[old]]).map((s) => s.key)).toContain('bs-old')
  })

  it('doesn’t say which board a post is on, on that board’s own page', () => {
    const BOARD = 'at://did:plc:kkkkkkkkkkkkkkkkkkkkkkkk/io.paperwing.board/3m2kitchenaaa'
    const r = reader()
    const plan = planChannel(r, 'cb:did:plc:kkkkkkkkkkkkkkkkkkkkkkkk:3m2kitchenaaa', { sort: 'hot', blueskyEnabled: false })
    expect(plan).toBeDefined()
    expect(rankChannel(plan!, r, [fromBoard(BOARD)])[0].board).toBeUndefined()
  })

  it('leaves announcements out of For you once you’ve turned them off, and only unpins them elsewhere', () => {
    expect(ranked(reader({ followed: ['web'] }))[0]).toBe('bs-news')
    expect(ranked(reader({ followed: ['web'], announcements: false }))).not.toContain('bs-news')
    const plan = planChannel(reader({ announcements: false }), 'paperwing', { sort: 'hot', blueskyEnabled: false })!
    const onFront = rankChannel(plan, reader({ announcements: false }), [front])
    expect(onFront.find((s) => s.key === 'bs-news')).toMatchObject({ pinned: undefined })
  })
})

describe('planning Latest', () => {
  it('asks each source for its newest posts, not its front page reordered', () => {
    const hot = kinds(reader(), 'hn', { variant: 'top', sort: 'hot' })
    const latest = kinds(reader(), 'front', { sort: 'new' })
    expect(hot).toEqual([{ kind: 'hn', list: 'top' }])
    expect(latest).toContainEqual({ kind: 'hn', list: 'new' })
    expect(latest).toContainEqual({ kind: 'lobsters', path: 'newest' })
  })

  it('reads the same feeds for Hot, Top and Spicy, so switching between them fetches nothing', () => {
    const ids = (sort: 'hot' | 'top' | 'spicy') => planChannel(reader({ followed: ['web'] }), 'for-you', { sort, blueskyEnabled: true })!.feeds.map((f) => f.id)
    expect(ids('top')).toEqual(ids('hot'))
    expect(ids('spicy')).toEqual(ids('hot'))
  })
})

describe('feed ids', () => {
  it("never share a cache between two people's Following", () => {
    const following = (did: string) => planChannel(reader({ bluesky: { did, timeline: true } }), 'bluesky', { variant: 'following', sort: 'hot', blueskyEnabled: true })!.feeds[0].id
    expect(following('did:plc:aaa')).not.toBe(following('did:plc:bbb'))
  })

  it('never share a cache between two Mastodon servers', () => {
    const trends = (instance: string) => planChannel(reader({ mastodon: { instance } }), 'mastodon', { sort: 'hot', blueskyEnabled: true })!.feeds[0].id
    expect(trends('hachyderm.io')).not.toBe(trends('mastodon.social'))
  })
})

describe('ranking a channel', () => {
  const plan = (r: Reader) => planChannel(r, 'for-you', { sort: 'hot', blueskyEnabled: false })!

  it('keeps what you muted, hid or your labelers hide out of the list', () => {
    const r = reader({
      followed: ['web'],
      mutedWords: ['crypto'],
      hidden: { 'hn-2': 1 },
      labelers: [{ did: 'did:plc:labeler', name: 'Labels', defs: { spam: { name: 'Spam', setting: 'hide' } } }],
    })
    const p = plan(r)
    const batches = p.feeds.map((_, i) =>
      i === 0
        ? [
            story({ key: 'hn-1', title: 'A web browser built from scratch' }),
            story({ key: 'hn-2', title: 'Something you hid', url: 'https://example.com/2' }),
            story({ key: 'hn-3', title: 'Crypto is back', url: 'https://example.com/3' }),
            story({ key: 'hn-4', title: 'A labelled post', url: 'https://example.com/4', labels: [{ src: 'did:plc:labeler', val: 'spam' }] }),
          ]
        : [],
    )
    expect(rankChannel(p, r, batches).map((s) => s.key)).toEqual(['hn-1'])
  })

  it('keeps only the keyword-search results that are really about the topic', () => {
    const r = reader({ followed: ['observability'] })
    const p = plan(r)
    const search = p.feeds.findIndex((f) => f.ref.kind === 'hnSearch')
    const batches = p.feeds.map((_, i) =>
      i === search ? [story({ key: 'hn-10', title: 'Distributed tracing with OpenTelemetry' }), story({ key: 'hn-11', title: 'My grandmother’s observatory', url: 'https://example.com/11' })] : [],
    )
    expect(rankChannel(p, r, batches).map((s) => s.key)).toEqual(['hn-10'])
  })

  it('treats a feed that has not answered yet as empty', () => {
    const r = reader({ followed: ['web'] })
    const p = plan(r)
    expect(
      rankChannel(
        p,
        r,
        p.feeds.map(() => undefined),
      ),
    ).toEqual([])
  })
})

describe('ranking search results', () => {
  it('applies your moderation, as feeds do', () => {
    const r = reader({ labelers: [{ did: 'did:plc:labeler', name: 'Labels', defs: { spam: { name: 'Spam', setting: 'hide' } } }] })
    const results = [story({ key: 'bs-1', title: 'A clean post' }), story({ key: 'bs-2', title: 'A labelled post', url: 'https://example.com/b', labels: [{ src: 'did:plc:labeler', val: 'spam' }] })]
    expect(rankStories(r, [results], { sort: 'top' }).map((s) => s.key)).toEqual(['bs-1'])
  })
})

describe("planning Bluesky's Following", () => {
  const following = (r: Reader) => planChannel(r, 'bluesky', { variant: 'following', sort: 'hot', blueskyEnabled: true })!
  it('asks you to sign in when signed out', () => {
    const p = following(reader())
    expect(p.feeds).toEqual([])
    expect(p.channel.empty?.title).toMatch(/Sign in/)
  })
  it('asks for the timeline permission when an older sign-in lacks it', () => {
    const p = following(reader({ bluesky: { did: 'did:plc:aaa', timeline: false } }))
    expect(p.feeds).toEqual([])
    expect(p.channel.empty?.title).toBe('One more permission')
  })
  it('reads the timeline while the permission is unknown, or granted', () => {
    for (const timeline of [undefined, true]) {
      const p = following(reader({ bluesky: { did: 'did:plc:aaa', timeline } }))
      expect(p.feeds.map((f) => f.ref)).toEqual([{ kind: 'bluesky', feed: 'following' }])
      expect(p.channel.empty).toBeUndefined()
    }
  })
})

describe('For you before following anything', () => {
  it('reads a starter mix, so a newcomer lands on news rather than an empty page', () => {
    const p = planChannel(reader(), 'for-you', { sort: 'hot', blueskyEnabled: true })!
    expect(p.feeds.length).toBeGreaterThan(5)
    expect(p.channel.blurb).toMatch(/starter mix/i)
  })
  it('switches to your own topics as soon as you follow one', () => {
    const p = planChannel(reader({ followed: ['space'] }), 'for-you', { sort: 'hot', blueskyEnabled: true })!
    expect(p.channel.blurb).toBe('Ranked across Space')
  })
})
