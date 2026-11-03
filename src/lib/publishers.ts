import type { FeedRef } from './topics.js'

export type PublisherFormat = 'discourse' | 'standard'

/** A followed publisher; an omitted format is an ordinary RSS or Atom feed. */
export interface PublisherFeed {
  url: string
  label: string
  site?: string
  format?: PublisherFormat
}

export interface FoundFeed {
  url: string
  title: string
  site: string
  posts: number
  latest?: number
  format?: PublisherFormat
}

/** The same publisher request everywhere: channels, mixes and a followed feed's own page. */
export const publisherRef = (f: PublisherFeed): Extract<FeedRef, { kind: 'rss' | 'standard' }> => ({ kind: f.format === 'standard' ? 'standard' : 'rss', url: f.url, label: f.label })
