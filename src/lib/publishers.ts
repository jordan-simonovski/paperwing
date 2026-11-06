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
 * As many feeds as you can follow. Every synced setting travels sealed in one record of at most
 * 64,000 characters (api/sync.ts), and sealing adds about a third: your feeds get the room the other
 * settings leave in that (follow.ts, feedRoom), measured in bytes, so names in any script count right.
 */
export const MAX_FEEDS = 250

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length

/** Your feeds with new ones added after them, once each, while they fit in `room` bytes: what was added, and how many didn't fit. */
export function addFeeds(current: PublisherFeed[], incoming: PublisherFeed[], room: number): { feeds: PublisherFeed[]; added: PublisherFeed[]; left: number } {
  const have = new Set(current.map((f) => f.url))
  const fresh = incoming.filter((f) => !have.has(f.url) && have.add(f.url))
  const feeds = [...current]
  let used = bytes(feeds)
  const added: PublisherFeed[] = []
  for (const f of fresh) {
    const size = bytes(f) + 1
    if (feeds.length >= MAX_FEEDS || used + size > room) break
    feeds.push(f)
    added.push(f)
    used += size
  }
  return { feeds, added, left: fresh.length - added.length }
}

/** Your feeds by folder, loose ones first, then each folder in the order it first appears: the groups Settings shows and an export writes. */
export function byFolder<F extends PublisherFeed>(feeds: F[]): { name: string; feeds: F[] }[] {
  const groups = new Map<string, F[]>([['', []]])
  for (const f of feeds) groups.set(f.folder ?? '', [...(groups.get(f.folder ?? '') ?? []), f])
  return [...groups].map(([name, feeds]) => ({ name, feeds })).filter((g) => g.feeds.length)
}

/**
 * Words that make a query parameter a key to someone's account, wherever they sit in its name
 * (feed_token, private-token, X-Amz-Signature, authToken). Catching too much only means adding a
 * feed by hand, or leaving it off a public blogroll. A secret in the path (/private/<id>.rss) can't be told apart.
 */
const SECRET_WORDS = new Set(['token', 'tokens', 'auth', 'key', 'apikey', 'secret', 'password', 'passwd', 'pass', 'pwd', 'sig', 'signature', 'credential', 'credentials'])
const words = (name: string) => name.split(/[_\-.]+|(?<=[a-z])(?=[A-Z])/).map((w) => w.toLowerCase())

/**
 * A feed address that's a key to someone's account: a password in it, or a parameter named like a
 * token. Never imported, nor listed in a blogroll. One that can't be read counts as private: it's
 * never shown to anyone on a guess.
 */
export function isPrivateAddress(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return true
  }
  return !!(u.username || u.password) || [...u.searchParams.keys()].some((k) => words(k).some((w) => SECRET_WORDS.has(w)))
}

export interface FoundFeed {
  url: string
  title: string
  site: string
  posts: number
  latest?: number
  format?: PublisherFormat
}

/** A blog in Explore's open web directory: who wrote it (their DID), and who lists it in a blogroll. */
export interface DirectoryFeed extends FoundFeed {
  author: string
  listedBy?: string[]
}

/** The same publisher request everywhere: channels, mixes and a followed feed's own page. */
export const publisherRef = (f: PublisherFeed): Extract<FeedRef, { kind: 'rss' | 'standard' }> => ({ kind: f.format === 'standard' ? 'standard' : 'rss', url: f.url, label: f.label })
