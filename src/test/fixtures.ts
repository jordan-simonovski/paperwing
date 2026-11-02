import type { Ranked } from '../lib/rank'
import type { Story } from '../lib/types'

// Stories and tests build their data from these, so a change to Story's shape is fixed in one place.

const HOUR = 3_600_000
/** A fixed "now" for anything that shows a time: stories and tests render the same every run. */
export const NOW = Date.UTC(2026, 10, 2, 9, 0)

let n = 0
export function story(overrides: Partial<Story> = {}): Story {
  n++
  return {
    key: `hn-${4000000 + n}`,
    source: 'hn',
    sourceLabel: 'Hacker News',
    title: 'The Web We Lost',
    url: 'https://anildash.com/2012/12/13/the_web_we_lost/',
    discussionUrl: `https://news.ycombinator.com/item?id=${4000000 + n}`,
    author: 'anildash',
    score: 412,
    comments: 187,
    createdAt: NOW - 3 * HOUR,
    hasThread: true,
    ...overrides,
  }
}

export function ranked(overrides: Partial<Ranked> = {}): Ranked {
  const { alsoOn = [], topics = ['web'], heat = 0.7, ...rest } = overrides
  return { ...story(rest), alsoOn, topics, heat }
}

/** A few believable stories from different places, for lists. */
export const sampleStories = (): Ranked[] => [
  ranked({ title: 'The Web We Lost', topics: ['web'], alsoOn: [story({ source: 'lemmy', sourceLabel: 'c/technology', key: 'lm-1', comments: 42 })] }),
  ranked({
    key: 'rss-1',
    source: 'rss',
    sourceLabel: 'Quanta',
    site: 'quantamagazine.org',
    title: 'A New Proof Smooths Out the Math of Melting',
    url: 'https://www.quantamagazine.org/a-new-proof-smooths-out-the-math-of-melting/',
    discussionUrl: null,
    hasThread: false,
    score: undefined,
    comments: undefined,
    text: 'Mathematicians have long struggled to describe what happens at the boundary between ice and water.',
    topics: ['science'],
    heat: 0.3,
  }),
  ranked({
    key: 'bs-1',
    source: 'bluesky',
    sourceLabel: 'Bluesky',
    author: 'paperwing.io',
    title: 'Every topic, board, mix and profile on PaperWing now has its own RSS feed.',
    url: null,
    discussionUrl: 'https://bsky.app/profile/paperwing.io/post/1',
    score: 96,
    comments: 12,
    topics: ['web'],
  }),
]
