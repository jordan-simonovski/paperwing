import { beforeEach, describe, expect, it } from 'vitest'
import { momentumOf, resetMomentum } from './momentum'
import type { Story } from './types'

const minute = 60_000
const hour = 60 * minute
const story = (score: number, comments = 0): Story => ({
  key: 'hn-1',
  source: 'hn',
  sourceLabel: 'Hacker News',
  title: 't',
  url: 'https://a.example',
  discussionUrl: null,
  score,
  comments,
  createdAt: 0,
  hasThread: true,
})
const seen = (score: number, at: number) => momentumOf([{ stories: [story(score)], at }])

beforeEach(() => resetMomentum())

describe('momentum', () => {
  it('is how fast a story gains, in Hot’s points an hour, once it’s been watched a quarter of an hour', () => {
    expect(seen(50, 0)).toEqual({})
    expect(seen(60, 10 * minute)).toEqual({})
    // 50 more votes in half an hour, scored as Hot scores them (0.7 a vote): 70 an hour.
    expect(seen(100, 30 * minute)['hn-1']).toBeCloseTo(70, 0)
  })

  it('never counts a story that lost points as moving', () => {
    seen(80, 0)
    expect(seen(60, 30 * minute)).toEqual({})
  })

  it('times a gain by when the feed was fetched, so a feed restored from three hours ago isn’t a sudden rush', () => {
    seen(50, 0)
    // The same story fetched fresh: 50 more votes over three hours, not over the minutes since the page opened.
    expect(seen(100, 3 * hour)['hn-1']).toBeCloseTo(35 / 3, 0)
  })

  it('measures the last hour or so, not the day: an early rush stops counting', () => {
    seen(0, 0)
    seen(200, 30 * minute)
    seen(200, hour + 30 * minute)
    // Two hours in, with nothing since the first half hour: the rush is behind it.
    expect(seen(200, 2 * hour + 30 * minute)).toEqual({})
  })
})

describe('the same story in two feeds', () => {
  it('takes the faster gain, whichever feed comes last', () => {
    resetMomentum()
    momentumOf([{ stories: [story(50)], at: 0 }])
    expect(
      momentumOf([
        { stories: [story(100)], at: 30 * minute },
        { stories: [story(75)], at: 30 * minute },
      ])['hn-1'],
    ).toBeCloseTo(70, 0)
  })
})
