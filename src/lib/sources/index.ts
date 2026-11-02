import { fetchPerson } from '../people'
import { useMastodon } from '../mastodon'
import type { FeedRef } from '../topics'
import type { Article, Story, Thread } from '../types'
import { devtoTag, devtoThread } from './devto'
import { hnByUrl, hnList, hnSearch, hnThread } from './hn'
import { api, getJson, urlFromLinkKey } from './http'
import { blueskyCustomFeed, blueskyFeed, blueskyFollowing, blueskyThread } from './bluesky'
import { useAtproto } from '../atproto'
import { lemmyByUrl, lemmyFeed, lemmyThread } from './lemmy'
import { parseLemmyKey } from '../lemmyKey'
import { useLemmyAccount } from '../lemmyAccount'
import { mastodonHome, mastodonTags, mastodonThread, mastodonTrends } from './mastodon'

export { linkKey, urlFromLinkKey } from './http'
export { hnSearch } from './hn'
export { blueskyEnabled } from './bluesky'

export function feedId(ref: FeedRef): string {
  switch (ref.kind) {
    case 'hn':
      return `hn:${ref.list}`
    case 'hnSearch':
      return `hns:${ref.query}`
    case 'frontpage':
      return `fp:${ref.feed}`
    case 'news':
      return `nw:${ref.q}`
    case 'paperwing':
      return `pw:${ref.sort}:${ref.board ?? ''}`
    case 'person':
      return `pp:${ref.actor}`
    case 'bskyFeed':
      return `bsf:${ref.uri}`
    case 'lobsters':
      return `lb:${ref.path}`
    case 'devto':
      return `dv:${ref.tag}`
    case 'rss':
      return `rss:${ref.url}`
    case 'arxiv':
      return `ax:${ref.q}`
    case 'hf':
      return 'hf'
    case 'github':
      return `gh:${ref.q}`
    case 'bluesky':
      // Following is per account: switching accounts never shows the last one's.
      return ref.feed === 'following' ? `bs:following:${useAtproto.getState().did ?? ''}` : `bs:${ref.feed}`
    case 'releases':
      return `rel:${ref.repos.join(',')}`
    case 'lemmy':
      return `lm:${ref.community}:${ref.sort ?? 'Hot'}${ref.via ? `@${ref.via}` : ''}`
    case 'status':
      return `st:${ref.providers?.join(',') ?? 'all'}:${ref.active ? 'active' : 'week'}:${ref.hosts?.join(',') ?? ''}`
    case 'mastodon':
      // The server is part of the id, so switching servers never shows the old one's cache.
      return `md:${useMastodon.getState().instance}:${ref.feed}:${ref.tags?.join(',') ?? ''}`
  }
}

export function feedLabel(ref: FeedRef): string {
  switch (ref.kind) {
    case 'hn':
      return ref.list === 'top' ? 'Hacker News' : `HN ${ref.list}`
    case 'hnSearch':
      return 'HN search'
    case 'lobsters':
      return ref.path.startsWith('t/')
        ? `Lobsters ${ref.path
            .slice(2)
            .split(',')
            .map((t) => `#${t}`)
            .join(' ')}`
        : 'Lobsters'
    case 'devto':
      return `dev.to #${ref.tag}`
    case 'rss':
      return ref.label
    case 'arxiv':
      return 'arXiv'
    case 'hf':
      return 'HF Papers'
    case 'github':
      return 'GitHub'
    case 'bluesky':
      return ref.feed === 'tech' ? 'Bluesky' : ref.feed === 'following' ? 'Bluesky following' : `Bluesky ${ref.feed}`
    case 'releases':
      return `Releases (${ref.repos.length} projects)`
    case 'lemmy':
      return `Lemmy c/${ref.community.split('@')[0]}`
    case 'status':
      return ref.active ? 'Status pages, ongoing' : 'Status pages'
    case 'frontpage':
      return ref.feed === 'hot' ? 'Frontpage' : `Frontpage ${ref.feed}`
    case 'bskyFeed':
      return ref.name
    case 'news':
      return `News: ${ref.q}`
    case 'paperwing':
      return ref.board ? 'PaperWing board' : 'PaperWing'
    case 'person':
      return ref.label ?? `@${ref.actor}`
    case 'mastodon':
      return ref.feed === 'tags' ? `Mastodon ${(ref.tags ?? []).map((t) => `#${t}`).join(' ')}` : ref.feed === 'home' ? 'Mastodon following' : 'Mastodon trending'
  }
}

export async function fetchFeed(ref: FeedRef): Promise<Story[]> {
  switch (ref.kind) {
    case 'hn':
      return hnList(ref.list)
    case 'hnSearch':
      return hnSearch(ref.query, { anyWord: ref.anyWord, days: ref.anyWord ? 7 : 30, minPoints: ref.anyWord ? 5 : 2, limit: 100 })
    case 'devto':
      return devtoTag(ref.tag)
    case 'lobsters':
      return (await api('feed', { src: 'lobsters', path: ref.path })) as Story[]
    case 'rss':
      return (await api('feed', { src: 'rss', url: ref.url, label: ref.label })) as Story[]
    case 'arxiv':
      return (await api('feed', { src: 'arxiv', q: ref.q })) as Story[]
    case 'hf':
      return (await api('feed', { src: 'hf' })) as Story[]
    case 'github':
      return (await api('feed', { src: 'github', q: ref.q })) as Story[]
    case 'bluesky':
      return ref.feed === 'following' ? blueskyFollowing() : blueskyFeed(ref.feed)
    case 'releases':
      return (await api('feed', { src: 'releases', repos: ref.repos.join(',') })) as Story[]
    case 'lemmy':
      return lemmyFeed(ref.community, ref.sort, ref.via)
    case 'status':
      return (await api('feed', { src: 'status', providers: ref.providers?.join(','), active: ref.active ? '1' : undefined, hosts: ref.hosts?.length ? ref.hosts.join(',') : undefined })) as Story[]
    case 'mastodon':
      return ref.feed === 'tags' ? mastodonTags(ref.tags ?? []) : ref.feed === 'home' ? mastodonHome() : mastodonTrends()
    case 'frontpage':
      return (await api('feed', { src: 'frontpage', feed: ref.feed })) as Story[]
    case 'bskyFeed':
      return blueskyCustomFeed(ref.uri)
    case 'news':
      return (await api('feed', { src: 'news', q: ref.q })) as Story[]
    case 'paperwing':
      return (await api('feed', { src: 'paperwing', sort: ref.sort, board: ref.board })) as Story[]
    case 'person':
      return ((p) => [...p.stories, ...(p.shares ?? [])])(await fetchPerson(ref.actor))
  }
}

export async function fetchThread(key: string): Promise<Thread | null> {
  const [prefix, id] = [key.slice(0, 2), key.slice(3)]
  switch (prefix) {
    case 'hn':
      return hnThread(id)
    case 'dv':
      return devtoThread(id)
    case 'lb':
      return (await api('thread', { src: 'lobsters', id })) as Thread
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
