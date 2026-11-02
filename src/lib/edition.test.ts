import { describe, expect, it } from 'vitest'
import { buildEdition } from './edition'
import type { Ranked } from './rank'

const now = Date.now()
const r = (key: string, topics: string[], hoursAgo = 2): Ranked => ({
  key,
  source: 'hn',
  sourceLabel: 'HN',
  title: key,
  url: null,
  discussionUrl: null,
  createdAt: now - hoursAgo * 3_600_000,
  hasThread: true,
  heat: 0.5,
  alsoOn: [],
  topics,
})

describe('buildEdition', () => {
  // In hot order: the AI stories are hottest, so a plain top-N would be all AI.
  const stories = [r('ai1', ['ai']), r('ai2', ['ai']), r('ai3', ['ai']), r('ai4', ['ai']), r('obs1', ['observability']), r('obs2', ['observability']), r('db1', ['databases']), r('old', ['ai'], 100)]

  it('gives every followed topic its top stories before filling with the rest', () => {
    const sections = buildEdition(stories, { followed: ['ai', 'observability'], since: now - 24 * 3_600_000, exclude: () => false, now, size: 6 })
    expect(sections.map((s) => [s.topic, s.stories.map((x) => x.key)])).toEqual([
      ['ai', ['ai1', 'ai2']],
      ['observability', ['obs1', 'obs2']],
      [undefined, ['ai3', 'ai4']],
    ])
  })
  it('skips what you have read or saved, and reaches back further when the day was quiet', () => {
    const sections = buildEdition(stories, { followed: ['ai'], since: now - 3 * 3_600_000, exclude: (k) => k === 'ai1', now, size: 20 })
    const keys = sections.flatMap((s) => s.stories.map((x) => x.key))
    expect(keys).not.toContain('ai1')
    expect(keys).not.toContain('old')
    expect(keys).toContain('db1')
  })
})
