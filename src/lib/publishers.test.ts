import { describe, expect, it } from 'vitest'
import { addFeeds, FEEDS_BYTES, MAX_FEEDS, publisherRef } from './publishers'
import { mixSourceFor, resolveChannel } from './channels'
import { cleanMix } from './mixSources'
import { mixFeedRefs } from './mixes'
import { buildOpml, parseOpml } from './opml'
import { channelId } from './channelId'
import { follow, isFollowed } from './follow'
import { usePrefs } from './store'
import { cleanBlogroll } from './social'

const publisher = { url: 'https://writer.example/journal', label: 'A journal', site: 'writer.example', format: 'standard' as const }

describe('native publishers in existing channels', () => {
  it('preserves the native format when followed or shared in a blogroll', () => {
    usePrefs.setState({ customFeeds: [] })
    follow({ url: publisher.url, title: publisher.label, site: publisher.site, posts: 0, format: 'standard' })
    expect(usePrefs.getState().customFeeds).toEqual([publisher])
    expect(cleanBlogroll({ feeds: [publisher] })?.feeds).toEqual([publisher])
  })

  it('lets a reader follow two Discourse categories on the same forum', () => {
    usePrefs.setState({ customFeeds: [{ url: 'https://forum.example/c/help/7.rss', label: 'Help', format: 'discourse' }] })
    const other = { url: 'https://forum.example/c/news/8.rss', title: 'News', site: 'forum.example', posts: 1, format: 'discourse' as const }
    expect(isFollowed(other, new Set(['forum.example']))).toBe(false)
  })

  it('keeps Standard.site native when followed, opened as a channel or added to a mix', () => {
    const ref = { kind: 'standard', url: publisher.url, label: publisher.label }
    expect(publisherRef(publisher)).toEqual(ref)
    const ctx = { followed: ['world-news'], interests: [], customFeeds: [publisher] }
    expect(resolveChannel('blogs', undefined, ctx)?.feeds).toContainEqual(ref)
    expect(resolveChannel(channelId({ kind: 'feed', url: publisher.url }), undefined, ctx)?.feeds).toEqual([ref])
    expect(mixSourceFor(resolveChannel(channelId({ kind: 'feed', url: publisher.url }), undefined, ctx)!)?.source).toEqual(ref)
    const mix = cleanMix({ name: 'Reading', sources: [ref] })!
    expect(mix?.sources).toEqual([ref])
    expect(mixFeedRefs(mix.sources, () => [])).toEqual([ref])
  })

  it('round-trips the publication format through OPML without calling its home page an RSS feed', () => {
    const exported = buildOpml('Reading', [{ name: 'Publishers', feeds: [publisher] }])
    expect(exported).toContain('type="standard"')
    expect(parseOpml(exported).feeds).toEqual([{ ...publisher, folder: 'Publishers' }])
    expect(publisherRef({ url: 'https://forum.example/c/help/7.rss', label: 'Help', format: 'discourse' })).toEqual({ kind: 'rss', url: 'https://forum.example/c/help/7.rss', label: 'Help' })
  })
})

describe('how many feeds you can follow', () => {
  const feed = (n: number, extra = {}) => ({ url: `https://blog${n}.example/feed.xml`, label: `Blog ${n}`, site: `blog${n}.example`, ...extra })

  it('adds new feeds once each, after the ones you have', () => {
    const { feeds, added, left } = addFeeds([feed(1)], [feed(1), feed(2), feed(2), feed(3)])
    expect(feeds.map((f) => f.label)).toEqual(['Blog 1', 'Blog 2', 'Blog 3'])
    expect(added.map((f) => f.label)).toEqual(['Blog 2', 'Blog 3'])
    expect(left).toBe(0)
  })

  it('stops at the limit, saying how many were left out', () => {
    const many = Array.from({ length: MAX_FEEDS + 40 }, (_, n) => feed(n))
    const { feeds, added, left } = addFeeds(many.slice(0, 10), many)
    expect(feeds).toHaveLength(MAX_FEEDS)
    expect(added).toHaveLength(MAX_FEEDS - 10)
    expect(left).toBe(40)
  })

  it('stops before your feeds outgrow what sync can carry, however long their addresses', () => {
    const long = Array.from({ length: MAX_FEEDS }, (_, n) => feed(n, { url: `https://blog${n}.example/${'x'.repeat(400)}`, label: 'L'.repeat(120), folder: 'F'.repeat(60) }))
    const { feeds, left } = addFeeds([], long)
    expect(JSON.stringify(feeds).length).toBeLessThanOrEqual(FEEDS_BYTES)
    expect(left).toBe(MAX_FEEDS - feeds.length)
    expect(left).toBeGreaterThan(0)
  })

  it('following one more when they’re full says so and follows nothing', () => {
    usePrefs.setState({ customFeeds: Array.from({ length: MAX_FEEDS }, (_, n) => feed(n)) })
    follow({ url: 'https://one-more.example/feed', title: 'One more', site: 'one-more.example', posts: 0 })
    expect(usePrefs.getState().customFeeds).toHaveLength(MAX_FEEDS)
    expect(usePrefs.getState().customFeeds.some((f) => f.url === 'https://one-more.example/feed')).toBe(false)
  })
})
