export type SourceKind = 'hn' | 'lobsters' | 'devto' | 'hf' | 'arxiv' | 'github' | 'release' | 'rss' | 'bluesky' | 'lemmy' | 'mastodon' | 'status' | 'frontpage'

/** An image or video attached to a post (Bluesky). */
export interface Media {
  kind: 'image' | 'video'
  thumb: string
  /** Full-size image. */
  full?: string
  /** HLS playlist for video. */
  playlist?: string
  alt?: string
  /** Width over height, when the source knows it. */
  aspect?: number
}

/** A post another post quotes (Bluesky quote posts, Mastodon quotes). */
export interface Quote {
  /** The app's key for it, so it can open in the reader. */
  key?: string
  author: string
  name?: string
  /** Its text as HTML. Sanitized before rendering. */
  html: string
  url?: string
  createdAt?: number
  media?: Media[]
  link?: { url: string; title?: string }
  /** Deleted, blocked or withdrawn by its author: there, but not shown. */
  gone?: boolean
}

export interface Story {
  /** Stable app-wide key: hn-123, lb-xyz, dv-42, bs-<uri>, lm-<programming.dev post id>, md-<server>-<status id>, st-<provider>-<incident id>, or ln-<base64url(url)> for link-only items. */
  key: string
  source: SourceKind
  /** Human label for the origin: "Hacker News", "Lobsters", "Simon Willison". */
  sourceLabel: string
  title: string
  /** External link. Null for self posts (Ask HN, Bluesky posts). */
  url: string | null
  /** Native discussion page, if the source has one. */
  discussionUrl: string | null
  author?: string
  score?: number
  comments?: number
  createdAt: number
  /** Self text or abstract, as HTML. Sanitized before rendering. */
  text?: string
  tags?: string[]
  /** A PaperWing self post's words (Markdown) and the versions PaperWing has seen of them. */
  selfPost?: { body: string; versions: { body: string; seenAt: number }[] }
  /** The community board a PaperWing listing is on, shown on the front page and in For you ("in Home Cooking"). */
  board?: { uri: string; name: string; official: boolean }
  /** An official announcement held at the top of PaperWing's front page for a few days. */
  pinned?: boolean
  thumbnail?: string
  /** True when comments can be rendered in-app. */
  hasThread: boolean
  /** Publisher's host for feed items (the blog, not the linked article), used for its logo. */
  site?: string
  /** Images or video the post itself carries. */
  media?: Media[]
  /** The post this one quotes. */
  quote?: Quote
  /** Moderation labels on the post and its author (Bluesky), judged by moderation.ts against your labelers. */
  labels?: { src: string; val: string }[]
  /** The author's DID, where the source has one: their own labels count only on their own posts. */
  authorDid?: string
  /** Why it's behind a warning: a label's name, or the author's own content warning. */
  warning?: string
  /** Only its pictures are covered, not its words. */
  warnMediaOnly?: boolean
  /** Its atproto record (Bluesky, Frontpage): what a reply, like or vote points at. */
  ref?: { uri: string; cid: string }
  /** People you follow on Bluesky who shared this link (Following). */
  sharedBy?: string[]
  /** What the person who shared it on PaperWing said about it (io.paperwing.share). */
  shareNote?: string
  /** The share record itself, so its author can take it back. */
  shareUri?: string
  /** From your own Mastodon home timeline: someone you follow posted or boosted it. */
  followed?: boolean
  /** Engagement for a story with no votes to go on (a status page incident: its impact). */
  weight?: number
}

export interface Comment {
  id: string
  author: string
  /** The author's DID, where the source has one (Bluesky): for judging their own labels. */
  authorDid?: string
  /** Moderation labels (Bluesky), judged by moderation.ts. */
  labels?: { src: string; val: string }[]
  /** The author's own content warning (Mastodon). */
  warning?: string
  /** Set by moderateComments: why this comment is folded away until asked for. */
  folded?: string
  html: string
  createdAt: number
  score?: number
  deleted?: boolean
  children: Comment[]
  /** Replies the source didn't return inline ("more" stubs). */
  more?: number
  url?: string
  media?: Media[]
  /** The post this comment quotes. */
  quote?: Quote
  /** Its atproto record (Bluesky, Frontpage): what a reply, like or vote points at. */
  ref?: { uri: string; cid: string }
}

export interface Thread {
  story: Story
  comments: Comment[]
}

export interface Article {
  url: string
  title: string
  byline?: string
  siteName?: string
  html: string
  excerpt?: string
  length?: number
  publishedTime?: string
}
