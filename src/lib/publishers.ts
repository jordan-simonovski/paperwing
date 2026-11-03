import type { FeedRef } from './topics.js'

export type PublisherFormat = 'discourse' | 'standard'

/** A followed publisher; an omitted format is an ordinary RSS or Atom feed. */
export interface PublisherFeed {
  url: string
  label: string
  site?: string
  format?: PublisherFormat
  /** The folder it was in, where it came from another reader. */
  folder?: string
}

/**
 * As many feeds as you can follow. Every synced setting travels as one record of at most 64 KB
 * (api/sync.ts), so your feeds also stop well short of that, however long their addresses.
 */
export const MAX_FEEDS = 250
export const FEEDS_BYTES = 40_000

/** Your feeds with new ones added after them, once each, up to the limit: what was added, and how many didn't fit. */
export function addFeeds(current: PublisherFeed[], incoming: PublisherFeed[]): { feeds: PublisherFeed[]; added: PublisherFeed[]; left: number } {
  const have = new Set(current.map((f) => f.url))
  const fresh = incoming.filter((f) => !have.has(f.url) && have.add(f.url))
  const feeds = [...current]
  let bytes = JSON.stringify(feeds).length
  const added: PublisherFeed[] = []
  for (const f of fresh) {
    const size = JSON.stringify(f).length + 1
    if (feeds.length >= MAX_FEEDS || bytes + size > FEEDS_BYTES) break
    feeds.push(f)
    added.push(f)
    bytes += size
  }
  return { feeds, added, left: fresh.length - added.length }
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
