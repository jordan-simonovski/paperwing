import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LESSON, useActivity, usePrefs } from './store'
import type { Story } from './types'
import { resetVisits } from './visits'

const day = 86_400_000
const story = (key: string, title: string): Story & { topics: string[] } => ({
  key,
  source: 'hn',
  sourceLabel: 'Hacker News',
  title,
  url: `https://${key}.example/x`,
  discussionUrl: null,
  score: 10,
  comments: 0,
  createdAt: 0,
  hasThread: true,
  topics: [],
})

beforeEach(() => {
  vi.useRealTimers()
  usePrefs.setState({ affinity: {}, affinityAt: 0 })
  useActivity.setState({ impressions: {}, glimpses: {}, read: {}, lingered: {} })
  resetVisits(0)
})

describe('what the ranking learns', () => {
  it('lets old lessons fade as new ones come: a vote three months on counts for four of the old', () => {
    vi.useFakeTimers({ now: day, toFake: ['Date'] })
    usePrefs.getState().learn(story('a', 'zorblax'), 1)
    const first = usePrefs.getState().affinity['k:zorblax']
    vi.setSystemTime(91 * day)
    usePrefs.getState().learn(story('b', 'quux'), 1)
    expect(usePrefs.getState().affinity['k:zorblax']).toBeCloseTo(first / 4, 1)
    expect(usePrefs.getState().affinity['k:quux']).toBeCloseTo(first, 2)
  })

  it('learns a little from a story you stayed with, once', () => {
    const s = story('c', 'zorblax')
    useActivity.getState().linger(s)
    const after = usePrefs.getState().affinity['k:zorblax']
    expect(after).toBeGreaterThan(0)
    useActivity.getState().linger(s)
    expect(usePrefs.getState().affinity['k:zorblax']).toBe(after)
    // Less than an upvote teaches.
    usePrefs.setState({ affinity: {} })
    usePrefs.getState().learn(s, LESSON.vote)
    expect(usePrefs.getState().affinity['k:zorblax']).toBeGreaterThan(after)
  })

  it('learns a little against a story you passed on three visits without opening, and not before', () => {
    const s = story('d', 'zorblax')
    for (const visit of [0, 1, 2]) {
      resetVisits(visit * day)
      useActivity.getState().noteImpression(s)
      expect(usePrefs.getState().affinity['k:zorblax'] ?? 0).toBe(visit < 2 ? 0 : usePrefs.getState().affinity['k:zorblax'])
    }
    expect(usePrefs.getState().affinity['k:zorblax']).toBeLessThan(0)
    // One you opened isn't one you passed on.
    usePrefs.setState({ affinity: {} })
    useActivity.setState({ impressions: {}, read: { e: 1 } })
    for (const visit of [3, 4, 5]) {
      resetVisits(visit * day)
      useActivity.getState().noteImpression(story('e', 'zorblax'))
    }
    expect(usePrefs.getState().affinity['k:zorblax'] ?? 0).toBe(0)
  })
})

describe('what scrolling past can’t do', () => {
  it('never wears down something you like: passing on stories about it is just volume', () => {
    usePrefs.setState({ affinity: { 'k:zorblax': 2 }, affinityAt: 0 })
    for (const visit of [0, 1, 2]) {
      resetVisits(visit * day)
      useActivity.getState().noteImpression(story('f', 'zorblax'))
    }
    expect(usePrefs.getState().affinity['k:zorblax']).toBe(2)
  })

  it('never makes this device’s settings look newer to sync: only what you choose does', () => {
    usePrefs.setState({ syncedPrefsAt: 123 })
    useActivity.getState().linger(story('g', 'zorblax'))
    for (const visit of [0, 1, 2]) {
      resetVisits(visit * day)
      useActivity.getState().noteImpression(story('h', 'quux'))
    }
    expect(usePrefs.getState().affinity['k:zorblax']).toBeGreaterThan(0)
    expect(usePrefs.getState().affinity['k:quux']).toBeLessThan(0)
    expect(usePrefs.getState().syncedPrefsAt).toBe(123)
  })
})
