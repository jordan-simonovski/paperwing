import { describe, expect, it } from 'vitest'
import { matchesTopic, searchTopics, TOPIC_BY_ID, topicsForStory } from './topics'
import type { Story } from './types'

const story = (title: string, extra: Partial<Story> = {}): Story => ({ key: 'x', source: 'hn', sourceLabel: 'Hacker News', title, url: null, discussionUrl: null, createdAt: 0, hasThread: true, ...extra })
const topic = (id: string) => TOPIC_BY_ID.get(id)!

describe('topic matching', () => {
  it('matches whole words and prefixes', () => {
    expect(matchesTopic(topic('observability'), 'Distributed tracing with OpenTelemetry')).toBeTruthy()
    expect(matchesTopic(topic('observability'), 'Observable patterns in RxJS')).toBe('Observable')
    expect(matchesTopic(topic('agents'), 'The agency problem in startups')).toBeUndefined()
    expect(matchesTopic(topic('agents'), 'Building coding agents')).toBeTruthy()
  })

  it('respects case-sensitive terms', () => {
    expect(matchesTopic(topic('ai'), 'AI labs ship new models')).toBeTruthy()
    expect(matchesTopic(topic('ai'), 'Said the maid')).toBeUndefined()
    expect(matchesTopic(topic('agents'), 'Tool book of a knight, loeffelholz-codex.org')).toBeUndefined()
  })

  it('keeps engineering leadership distinct from other kinds of "manager"', () => {
    const lead = topic('leadership')
    for (const t of ['Long live the engineering manager', 'What staff engineers actually do', 'Running better 1:1s', 'Our DORA metrics were lying', 'Staff+ is not a promotion']) expect(matchesTopic(lead, t), t).toBeTruthy()
    for (const t of ['A password manager for teams', 'npm is a package manager', 'Memory management in Rust', 'Meeting at 11:15 tomorrow']) expect(matchesTopic(lead, t), t).toBeUndefined()
  })

  it('tags dedicated sources even without keywords', () => {
    expect(topicsForStory(story('Weekly on-call thread', { source: 'lobsters', sourceLabel: 'Lobsters' }))).toContain('sre')
    expect(topicsForStory(story('The end of Stack Overflow as you know it', { source: 'rss', sourceLabel: 'LeadDev' }))).toContain('leadership')
  })
})

describe('topic search', () => {
  it('finds topics by keyword and explains why', () => {
    const [hit] = searchTopics('tracing')
    expect(hit.topic.id).toBe('observability')
    expect(hit.via).toBe('tracing')
  })
  it('ranks label matches first', () => {
    expect(searchTopics('data')[0].topic.id).toBe('databases')
  })
  it('reads 1:1 as a meeting, not a ratio', () => {
    expect(topicsForStory(story('Switzerland. Block by block. At 1:1 scale'))).not.toContain('leadership')
    expect(topicsForStory(story('How I run 1:1s with my reports'))).toContain('leadership')
  })
})
