import { describe, expect, it } from 'vitest'
import { interestTopic, resolveChannel, SOURCE_CHANNELS, sourceChannels } from './channels'
import type { Interest } from './store'
import { matchesTopic, topicsForStory } from './topics'
import { story } from '../test/fixtures'

const base = { followed: [] as string[], interests: [], customFeeds: [] }

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
  it.each(['*NSYNC', 'what?', 'C++', 'foo\\', '(old) news', '=caps'])('matches "%s" as written, without throwing', (query) => {
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
