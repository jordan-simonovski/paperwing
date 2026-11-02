import { describe, expect, it } from 'vitest'
import { resolveChannel } from './channels'
import { parseLemmyKey, lemmyKey } from './lemmyKey'
import { CLUSTERS, isTechTopic, matchesTopic, TOPIC_BY_ID, TOPICS, topicsForStory } from './topics'
import type { Story } from './types'

const base = { followed: [] as string[], interests: [], customFeeds: [] }
const story = (title: string): Story => ({ key: 'x', source: 'rss', sourceLabel: 'Somewhere', title, url: null, discussionUrl: null, createdAt: 0, hasThread: false })

describe('topic packs', () => {
  it('have unique ids, real neighbours and a pack for every cluster', () => {
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length)
    for (const t of TOPICS) {
      expect(CLUSTERS[t.cluster]).toBeDefined()
      for (const r of t.related) expect(TOPIC_BY_ID.has(r), `${t.id} -> ${r}`).toBe(true)
    }
  })
  it('knows tech from everything else', () => {
    expect(isTechTopic('observability')).toBe(true)
    expect(isTechTopic('politics-au')).toBe(false)
    expect(isTechTopic('q:sourdough')).toBe(false)
  })
  it('tags general stories without stealing tech ones', () => {
    expect(topicsForStory(story('Verstappen takes pole at the Brazilian Grand Prix'))).toContain('motorsport')
    expect(topicsForStory(story('Senate passes the spending bill after a filibuster fight'))).toContain('politics-us')
    expect(matchesTopic(TOPIC_BY_ID.get('gaming')!, 'Building a game engine in Rust')).toBeUndefined()
    expect(matchesTopic(TOPIC_BY_ID.get('space')!, 'Rocket 0.6: a web framework for Rust')).toBeUndefined()
    expect(matchesTopic(TOPIC_BY_ID.get('music')!, 'Single sign-on with SAML')).toBeUndefined()
    expect(matchesTopic(TOPIC_BY_ID.get('books')!, 'A novel approach to garbage collection')).toBeUndefined()
  })
})

describe('For you and Publishers by pack', () => {
  it('keeps Hacker News for tech readers only', () => {
    const hn = (followed: string[]) => resolveChannel('for-you', undefined, { ...base, followed })!.feeds.some((f) => f.kind === 'hn')
    expect(hn([])).toBe(true)
    expect(hn(['ai', 'science'])).toBe(true)
    expect(hn(['science', 'football'])).toBe(false)
  })
  it('gives a non-tech reader their topics’ publishers, not every tech blog', () => {
    const c = resolveChannel('blogs', undefined, { ...base, followed: ['science'] })!
    expect(c.label).toBe('Publishers')
    expect(c.feeds.every((f) => f.kind === 'rss' && TOPIC_BY_ID.get('science')!.feeds.some((g) => g.kind === 'rss' && g.url === f.url))).toBe(true)
  })
  it('puts a topic’s Bluesky feeds and Lemmy instance on its page', () => {
    const c = resolveChannel('climate', undefined, base)!
    expect(c.feeds).toContainEqual(expect.objectContaining({ kind: 'bskyFeed' }))
    expect(c.feeds).toContainEqual(expect.objectContaining({ kind: 'lemmy', community: 'climate@slrpnk.net', via: 'lemmy.world' }))
  })
  it('makes a joined community its own channel', () => {
    const c = resolveChannel('c:world@lemmy.world', 'new', { ...base, communities: [{ name: 'world@lemmy.world', title: 'World News' }] })!
    expect(c.label).toBe('World News')
    expect(c.feeds).toEqual([{ kind: 'lemmy', community: 'world@lemmy.world', sort: 'New', via: 'lemmy.world' }])
    expect(resolveChannel('c:../../etc', undefined, base)).toBeUndefined()
  })
  it('builds an interest from news search too', () => {
    const c = resolveChannel('q:sourdough', undefined, { ...base, interests: [{ id: 'q:sourdough', label: 'sourdough', query: 'sourdough' }] })!
    expect(c.feeds).toContainEqual({ kind: 'news', q: 'sourdough' })
  })
})

describe('Lemmy keys', () => {
  it('keep old programming.dev keys and add the instance otherwise', () => {
    expect(lemmyKey(5)).toBe('lm-5')
    expect(lemmyKey(5, 'lemmy.world')).toBe('lm-5@lemmy.world')
    expect(parseLemmyKey('lm-5')).toEqual({ id: '5', via: 'programming.dev' })
    expect(parseLemmyKey('lm-5@lemmy.world')).toEqual({ id: '5', via: 'lemmy.world' })
  })
  it('never point anywhere else', () => {
    expect(parseLemmyKey('lm-5@169.254.169.254')).toBeUndefined()
    expect(parseLemmyKey('lm-5@evil.example')).toBeUndefined()
    expect(parseLemmyKey('lm-abc')).toBeUndefined()
  })
})
