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
  useActivity.setState({ impressions: {}, glimpses: {}, read: {}, lingered: {}, opened: {} })
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

  it('learns a little from a story you open, once, and less than from one you stay with', () => {
    const s = story('o', 'zorblax')
    useActivity.getState().noteOpen(s)
    const opened = usePrefs.getState().affinity['k:zorblax']
    expect(opened).toBeGreaterThan(0)
    useActivity.getState().noteOpen(s)
    expect(usePrefs.getState().affinity['k:zorblax']).toBe(opened)
    usePrefs.setState({ affinity: {} })
    useActivity.getState().linger(story('p', 'zorblax'))
    expect(usePrefs.getState().affinity['k:zorblax']).toBeGreaterThan(opened)
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
    useActivity.getState().noteOpen(story('g2', 'zorblax'))
    for (const visit of [0, 1, 2]) {
      resetVisits(visit * day)
      useActivity.getState().noteImpression(story('h', 'quux'))
    }
    expect(usePrefs.getState().affinity['k:zorblax']).toBeGreaterThan(0)
    expect(usePrefs.getState().affinity['k:quux']).toBeLessThan(0)
    expect(usePrefs.getState().syncedPrefsAt).toBe(123)
  })
})

describe('sparing what you like', () => {
  it('teaches the rest of a passed story no more than a plain pass would', () => {
    // A lesson big enough to leave a mark on every feature, so the shares can be compared.
    const lesson = -3
    const s = { ...story('i', 'zorblax quux'), topics: ['space'] }
    usePrefs.setState({ affinity: {}, affinityAt: 0 })
    usePrefs.getState().learn(s, lesson)
    const plain = usePrefs.getState().affinity['k:zorblax']
    expect(plain).toBeLessThan(0)
    usePrefs.setState({ affinity: { 't:space': 2 }, affinityAt: 0 })
    usePrefs.getState().learn(s, lesson, { passive: true, spareLiked: true })
    expect(usePrefs.getState().affinity['t:space']).toBe(2)
    expect(usePrefs.getState().affinity['k:zorblax']).toBe(plain)
  })

  it('teaches nothing when it likes every feature of the story', () => {
    const s = story('j', 'zorblax')
    usePrefs.setState({ affinity: {}, affinityAt: 0 })
    usePrefs.getState().learn(s, 3)
    const liked = usePrefs.getState().affinity
    usePrefs.getState().learn(s, -3, { passive: true, spareLiked: true })
    expect(usePrefs.getState().affinity).toEqual(liked)
  })
})
