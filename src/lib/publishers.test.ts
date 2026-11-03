import { describe, expect, it } from 'vitest'
import { publisherRef } from './publishers'
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
    expect(parseOpml(exported)).toEqual([publisher])
    expect(publisherRef({ url: 'https://forum.example/c/help/7.rss', label: 'Help', format: 'discourse' })).toEqual({ kind: 'rss', url: 'https://forum.example/c/help/7.rss', label: 'Help' })
  })
})
