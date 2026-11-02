import type { Article, Story, Thread } from '../types'
import { devtoThread } from './devto'
import { hnByUrl, hnThread } from './hn'
import { api, getJson, urlFromLinkKey } from './http'
import { blueskyThread } from './bluesky'
import { lemmyByUrl, lemmyThread } from './lemmy'
import { parseLemmyKey } from '../lemmyKey'
import { parseStoryKey } from '../storyKey'
import { useLemmyAccount } from '../lemmyAccount'
import { mastodonThread } from './mastodon'

export { linkKey, urlFromLinkKey } from './http'
export { FEED_KINDS, feedBrand, feedId, feedLabel, feedMark, fetchFeed, newestOf, type FeedMark, type FeedOwner } from './kinds'
export { hnSearch } from './hn'
export { blueskyEnabled } from './bluesky'

export async function fetchThread(key: string): Promise<Thread | null> {
  const p = parseStoryKey(key)
  switch (p?.kind) {
    case 'hn':
      return hnThread(p.id)
    case 'dv':
      return devtoThread(p.id)
    case 'lb':
      return (await api('thread', { src: 'lobsters', id: p.id })) as Thread
    case 'bs':
      return blueskyThread(key)
    case 'lm': {
      const lm = parseLemmyKey(key, useLemmyAccount.getState().instance)
      return lm ? lemmyThread(lm.id, lm.via) : null
    }
    case 'md':
      return mastodonThread(key)
    case 'st':
      return (await api('thread', { src: 'status', id: key })) as Thread
    case 'fp':
      return (await api('thread', { src: 'frontpage', id: key })) as Thread
    default:
      return null
  }
}

export async function fetchArticle(url: string): Promise<Article> {
  return getJson<Article>(`/api/extract?url=${encodeURIComponent(url)}`)
}

/** Every HN and Lemmy thread about a link, busiest first. One source failing doesn't hide the other. */
export async function findDiscussions(url: string): Promise<Story[]> {
  // Hacker News and Lemmy by their own URL search; Bluesky and Frontpage through the open network's link index.
  const found = await Promise.allSettled([hnByUrl(url), lemmyByUrl(url), api('feed', { src: 'atlinks', url }) as Promise<Story[]>])
  if (found.every((f) => f.status === 'rejected')) throw (found[0] as PromiseRejectedResult).reason
  return found.flatMap((f) => (f.status === 'fulfilled' ? f.value : [])).sort((a, b) => (b.comments ?? 0) - (a.comments ?? 0))
}

/** Minimal story for a key we have no cached data for (deep link to a blog post, say). */
export function storyFromKey(key: string): Story | undefined {
  const url = urlFromLinkKey(key)
  if (!url) return undefined
  let host = url
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    /* keep raw */
  }
  return { key, source: 'rss', sourceLabel: host, title: url, url, discussionUrl: null, createdAt: Date.now(), hasThread: false }
}
