import { resolveChannel, type Channel } from '../lib/channels'
import type { FeedStatus } from '../lib/hooks'
import type { Ranked } from '../lib/rank'
import type { Reader } from '../lib/channelFeed'
import { feedLabel } from '../lib/sources'
import type { Comment, Story, Thread } from '../lib/types'

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

/** A Bluesky account for stories and tests that need someone signed in. */
export const READER = { did: 'did:plc:readerexampleabcdefghijk', handle: 'reader.example', name: 'Robin Reader' }

/**
 * Story parameters for someone signed in with Bluesky: the account, their profile, and their
 * activity (pass notices to light up the unread badge). Plain data, so tests can use it too.
 */
export function signedInWithBluesky(notices: { kind: 'reply' | 'like' | 'mention' | 'follow'; actor: string; text?: string; subject?: string }[] = []) {
  return {
    atproto: { did: READER.did, handle: READER.handle },
    queries: [
      [['me', READER.did], { handle: READER.handle, name: READER.name }],
      [
        ['activity', 'bluesky', READER.did, true],
        {
          notices: notices.map((n, i) => ({ id: `n${i}`, network: 'bluesky', kind: n.kind, actors: [n.actor], at: NOW - (i + 1) * 600_000, text: n.text, subject: n.subject })),
          mine: [],
        },
      ],
      [['activity', 'frontpage', READER.did], { notices: [], mine: [] }],
    ] as [unknown[], unknown][],
  }
}

/* ------------------------------------------------------------- comments */

let c = 0
/** A comment: plain HTML text, an hour before NOW unless said otherwise. */
export function comment(overrides: Partial<Comment> = {}): Comment {
  c++
  return { id: `c${c}`, author: 'dang', html: '<p>A fine point, well made.</p>', createdAt: NOW - HOUR, score: 12, children: [], ...overrides }
}

/** A believable Hacker News discussion of "The Web We Lost", with nested replies. */
export const sampleComments = (): Comment[] => [
  comment({
    author: 'tptacek',
    html: '<p>The thing people forget is that RSS readers were <i>the</i> social network for a lot of us. Google Reader’s shared items did what every “discover” tab tries and fails to do.</p>',
    score: 214,
    createdAt: NOW - 2.5 * HOUR,
    children: [
      comment({
        author: 'anildash',
        html: '<p>This is exactly it. The tools let you see what people you trusted were reading, with their note on why.</p>',
        score: 88,
        createdAt: NOW - 2 * HOUR,
        children: [comment({ author: 'pg', html: '<p>And nobody was optimising it for minutes spent.</p>', score: 41, createdAt: NOW - 30 * 60_000 })],
      }),
      comment({ author: 'jacquesm', html: '<p>Blogrolls were the original recommendation engine. A human one.</p>', score: 37, createdAt: NOW - 90 * 60_000 }),
    ],
  }),
  comment({
    author: 'simonw',
    html: '<p>I still run my blog with an RSS feed and webmentions. It works fine; the audience just has to come back to it. Here’s how: <a href="https://simonwillison.net/">simonwillison.net</a></p>',
    score: 156,
    createdAt: NOW - 2 * HOUR,
    children: [comment({ author: 'dredmorbius', deleted: true, html: '', score: undefined, createdAt: NOW - HOUR })],
  }),
  comment({ author: 'throwaway42', html: '<p>Counterpoint: discovery was terrible and most people never found any of it.</p>', score: 9, createdAt: NOW - 20 * 60_000 }),
]

/** A thread as the reader loads it: the story and its comments. */
export const thread = (s: Story = story(), comments: Comment[] = sampleComments()): Thread => ({ story: s, comments })

/** A real channel, resolved the way FeedPage does, for someone following these topics. */
export function channelFor(id: string, followed: string[] = ['tech', 'science', 'space', 'web'], variant?: string) {
  const channel = resolveChannel(id, variant, { followed, interests: [], customFeeds: [] })
  if (!channel) throw new Error(`No channel ${id}`)
  return channel
}

/** Load states for each of a channel's feeds: all done, or with some still loading or failed. */
export function statusesFor(channel: Channel, opts: { failed?: number; loading?: number } = {}): FeedStatus[] {
  return channel.feeds.map((ref, i) => {
    const failed = i < (opts.failed ?? 0)
    const loading = !failed && i < (opts.failed ?? 0) + (opts.loading ?? 0)
    return {
      ref,
      id: `${i}:${feedLabel(ref)}`,
      label: feedLabel(ref),
      status: failed ? 'error' : loading ? 'pending' : 'success',
      count: failed || loading ? 0 : 12 + ((i * 7) % 20),
      error: failed ? 'The feed answered 503' : undefined,
      fetching: loading,
    }
  })
}

/** A reader who follows nothing, mutes nothing and isn't signed in anywhere, with whatever you override. */
export const testReader = (overrides: Partial<Reader> = {}): Reader => ({
  followed: [],
  interests: [],
  customFeeds: [],
  bskyFeeds: [],
  communities: [],
  mixes: [],
  followedMixes: [],
  people: [],
  boards: [],
  releaseRepos: [],
  statusHosts: [],
  mutedWords: [],
  mutedDomains: [],
  hidden: {},
  labelers: [],
  warnings: 'blur',
  taste: () => ({ seen: {}, affinity: {}, votes: {} }),
  ...overrides,
})
