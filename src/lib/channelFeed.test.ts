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
