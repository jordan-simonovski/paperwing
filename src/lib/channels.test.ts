import { describe, expect, it } from 'vitest'
import { interestTopic, resolveChannel, SOURCE_CHANNELS, sourceChannels } from './channels'
import type { Interest } from './store'
import { matchesTopic, topicsForStory } from './topics'
import { story } from '../test/fixtures'
import { channelId } from './channelId'

const base = { followed: [] as string[], interests: [], customFeeds: [] }

describe('shared channel links', () => {
  it('opens a Bluesky feed or list without subscribing first', () => {
    for (const collection of ['app.bsky.feed.generator', 'app.bsky.graph.list']) {
      const uri = `at://did:plc:reader/${collection}/science`
      expect(resolveChannel(channelId({ kind: 'bskyFeed', uri }), undefined, base)?.feeds).toEqual([{ kind: 'bskyFeed', uri, name: collection.includes('graph') ? 'Bluesky list' : 'Bluesky feed' }])
    }
  })
  it('does not fetch a malformed shared Bluesky address', () => {
    expect(resolveChannel(channelId({ kind: 'bskyFeed', uri: 'at://example/other.record/abc' }), undefined, base)).toBeUndefined()
  })
  it('keeps a shared Standard.site publication in its native format', () => {
    const url = 'https://writing.example'
    expect(resolveChannel(`feed:${url}`, undefined, { ...base, publisherFormat: 'standard' })?.feeds).toEqual([{ kind: 'standard', url, label: 'writing.example' }])
  })
  it('reconstructs a shared interest without writing subscriptions', () => {
    const found = resolveChannel('q:c++ / rust', undefined, base)
    expect(found?.topic?.label).toBe('c++ / rust')
    expect(found?.feeds).toContainEqual({ kind: 'news', q: 'c++ / rust' })
    expect(base.interests).toEqual([])
  })
})

describe('source channels', () => {
  it('shows tech’s own sources to people who follow tech, and Blogs as Publishers to everyone else', () => {
    const tech = sourceChannels(['observability']).map((c) => c.label)
    expect(tech).toContain('Hacker News')
    expect(tech).toContain('Blogs')
    const general = sourceChannels(['football', 'science']).map((c) => c.label)
    expect(general).not.toContain('Hacker News')
    expect(general).not.toContain('ML papers')
    expect(general).toContain('Publishers')
    expect(general).toContain('Bluesky')
  })

  it('all lead somewhere', () => {
    for (const c of SOURCE_CHANNELS) expect(resolveChannel(c.id, undefined, base), c.id).toBeDefined()
  })
})

describe('channel ids', () => {
  it('every topic and source channel has an id the codec reads', async () => {
    const { TOPICS } = await import('./topics')
    const { parseChannelId } = await import('./channelId')
    for (const id of [...TOPICS.map((t) => t.id), ...SOURCE_CHANNELS.map((c) => c.id), 'for-you', 'front'])
      expect(parseChannelId(id), id).toEqual(id === 'paperwing' ? { kind: 'paperwing' } : { kind: 'named', name: id })
  })
  it('a malformed id is no channel at all', () => {
    for (const bad of ['c:../../etc', 'cb:nope', 'feed:javascript:alert(1)', 'paperwing:no-such-board']) expect(resolveChannel(bad, undefined, base), bad).toBeUndefined()
  })
})

describe('free-text interests', () => {
  const interest = (query: string) => interestTopic({ id: `q:${query}`, label: query, query } as Interest)

  // Whatever someone types is a literal: a "*" or "?" or a stray backslash must not become regex
  // syntax, or compiling the topic throws and every ranked feed goes with it.
  it.each(['*NSYNC', 'what?', 'C++', 'foo\\', '(old) news', '=caps', 'wow*', 'C*'])('matches "%s" as written, without throwing', (query) => {
    const topic = interest(query)
    expect(() => matchesTopic(topic, 'nothing here')).not.toThrow()
    expect(matchesTopic(topic, `News about ${query} today`)).toBeTruthy()
    expect(topicsForStory(story({ title: `Something on ${query}` }), [topic])).toContain(topic.id)
  })

  it('still matches a plain word and a phrase across a hyphen', () => {
    expect(matchesTopic(interest('sourdough'), 'My sourdough starter')).toBeTruthy()
    expect(matchesTopic(interest('home lab'), 'Building a home-lab rack')).toBeTruthy()
  })
})
