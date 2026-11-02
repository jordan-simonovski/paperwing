import { NOW, story } from '../../src/test/fixtures'
import type { Article, Story } from '../../src/lib/types'

// What each upstream answers in the journeys, in its own wire shape: Algolia hits, Lemmy post
// views, Bluesky feed items, and the stories our own /api/feed sends. Stories carry the shared
// fixtures' NOW, and the browser's clock is pinned to it, so "3h" reads the same every run.

export { NOW }
const HOUR = 3_600_000
const unix = (ms: number) => Math.floor(ms / 1000)
const iso = (ms: number) => new Date(ms).toISOString()

/* ----------------------------------------------------------- Hacker News */

export interface HnHit {
  objectID: string
  title: string
  url: string | null
  author: string
  points: number
  num_comments: number
  created_at_i: number
}
export interface HnItem {
  id: number
  author: string | null
  title?: string
  url?: string | null
  text: string | null
  points: number | null
  created_at_i: number
  type: 'story' | 'comment'
  children: HnItem[]
}

/** An Algolia hit: a Hacker News story posted `ago` milliseconds before NOW. */
export const hit = (id: number, title: string, url: string, author: string, points: number, comments: number, ago: number): HnHit => ({
  objectID: String(id),
  title,
  url,
  author,
  points,
  num_comments: comments,
  created_at_i: unix(NOW - ago),
})

/** Top of Hacker News: a story with a discussion, and one more. */
export const WEB_WE_LOST = hit(41000001, 'The Web We Lost', 'https://anildash.com/2012/12/13/the_web_we_lost/', 'anildash', 412, 3, 3 * HOUR)
export const TELESCOPE = hit(41000002, 'Building a radio telescope from a satellite dish', 'https://en.wikipedia.org/wiki/Radio_telescope', 'jsmith', 128, 0, 5 * HOUR)
export const HN_TOP = [WEB_WE_LOST, TELESCOPE]

const comment = (id: number, author: string, text: string, ago: number, children: HnItem[] = []): HnItem => ({
  id,
  author,
  text,
  points: null,
  created_at_i: unix(NOW - ago),
  type: 'comment',
  children,
})

/** The Web We Lost's thread, as Algolia's items endpoint sends it. */
export const WEB_WE_LOST_THREAD: HnItem = {
  id: 41000001,
  author: 'anildash',
  title: WEB_WE_LOST.title,
  url: WEB_WE_LOST.url,
  text: null,
  points: WEB_WE_LOST.points,
  created_at_i: WEB_WE_LOST.created_at_i,
  type: 'story',
  children: [
    comment(41000101, 'tptacek', '<p>RSS readers were the social network for a lot of us.</p>', 2.5 * HOUR, [
      comment(41000102, 'anildash', '<p>The tools let you see what people you trusted were reading.</p>', 2 * HOUR),
    ]),
    comment(41000103, 'simonw', '<p>I still run my blog with an RSS feed and webmentions.</p>', 2 * HOUR),
  ],
}

/* ------------------------------------------------------------------ Lemmy */

export interface LemmyPostView {
  post: { id: number; name: string; url?: string; ap_id: string; nsfw: boolean; removed: boolean; deleted: boolean; published: string }
  creator: { name: string; actor_id: string }
  community: { name: string; actor_id: string }
  counts: { score: number; comments: number }
}

/** A Lemmy post in a community, four hours old. */
export const lemmyPost = (id: number, name: string, url: string, community: string, instance = 'lemmy.world'): LemmyPostView => ({
  post: { id, name, url, ap_id: `https://${instance}/post/${id}`, nsfw: false, removed: false, deleted: false, published: iso(NOW - 4 * HOUR) },
  creator: { name: 'mapper', actor_id: `https://${instance}/u/mapper` },
  community: { name: community, actor_id: `https://${instance}/c/${community}` },
  counts: { score: 230, comments: 18 },
})

/** c/world on lemmy.world, part of World news in the starter mix. */
export const SEABED = lemmyPost(900001, 'A quarter of the ocean floor is now mapped', 'https://seabed2030.org/', 'world')

/* ---------------------------------------------------- Our own /api/feed */

/** An RSS item as /api/feed?src=rss sends it: already a story. */
export const MELTING: Story = story({
  key: 'rss-quanta-1',
  source: 'rss',
  sourceLabel: 'Quanta',
  site: 'quantamagazine.org',
  title: 'A New Proof Smooths Out the Math of Melting',
  url: 'https://www.quantamagazine.org/a-new-proof-smooths-out-the-math-of-melting/',
  discussionUrl: null,
  hasThread: false,
  score: undefined,
  comments: undefined,
  author: undefined,
  createdAt: NOW - 2 * HOUR,
})

/** SpaceNews, one of the Space topic's publishers. */
export const STARSHIP: Story = story({
  key: 'rss-spacenews-1',
  source: 'rss',
  sourceLabel: 'SpaceNews',
  site: 'spacenews.com',
  title: 'Starship completes its first orbital refuelling test',
  url: 'https://spacenews.com/',
  discussionUrl: null,
  hasThread: false,
  score: undefined,
  comments: undefined,
  author: undefined,
  createdAt: NOW - HOUR,
})

/* ------------------------------------------------------- Reader view */

/**
 * The Web We Lost through /api/extract, with markup that must never run: if the sanitiser let
 * any of it through, it would set window.__pwned.
 */
export const WEB_WE_LOST_ARTICLE: Article = {
  url: WEB_WE_LOST.url!,
  title: WEB_WE_LOST.title,
  byline: 'Anil Dash',
  siteName: 'anildash.com',
  length: 4200,
  html: [
    '<p>The tech industry and its press have treated the rise of billion-scale social networks as an unalloyed good.</p>',
    '<script>window.__pwned = "script"</script>',
    '<img src="/missing-image.png" onerror="window.__pwned = \'onerror\'" alt="A broken image">',
    '<svg><image href="/missing-image.png" onerror="window.__pwned = \'svg\'"></image></svg>',
    '<p><a href="javascript:window.__pwned=\'link\'">A link that should not run</a></p>',
    '<p>Five years ago, most social users could control their own identity.</p>',
  ].join('\n'),
}
