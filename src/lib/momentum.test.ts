import { beforeEach, describe, expect, it } from 'vitest'
import { momentumOf, resetMomentum } from './momentum'
import type { Story } from './types'

const minute = 60_000
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

beforeEach(() => resetMomentum())

describe('momentum', () => {
  it('is how fast a story gains, in Hacker News points an hour, once it’s been watched a quarter of an hour', () => {
    expect(momentumOf([story(50)], 0)).toEqual({})
    expect(momentumOf([story(60)], 10 * minute)).toEqual({})
    // 50 more points in half an hour: 100 points an hour (scored like Hot scores them).
    expect(momentumOf([story(100)], 30 * minute)['hn-1']).toBeCloseTo(70, 0)
  })

  it('never counts a story that lost points as moving', () => {
    momentumOf([story(80)], 0)
    expect(momentumOf([story(60)], 30 * minute)).toEqual({})
  })
})
