import { keys } from './query'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { followsTech } from './channels'
import { feed } from './sources/http'
import { useActivity, usePrefs } from './store'
import { isTechTopic, TOPICS } from './topics'
import { toast } from './ui'
import { addFeeds, type FoundFeed } from './publishers'
export type { FoundFeed } from './publishers'

// Following a blog from anywhere: its feed is found from any link to it (api/_lib/discover.ts),
// from a story you're reading, from Settings, or from the sites you keep coming back to.

const bare = (host: string) => host.toLowerCase().replace(/^(www|feeds?|rss|blog)\./, '')
const hostOf = (url: string) => {
  try {
    return bare(new URL(url).hostname)
  } catch {
    return undefined
  }
}

/** Not blogs: aggregators, social networks, code and video hosts, big platforms. */
const NOT_BLOGS =
  /(^|\.)(ycombinator\.com|lobste\.rs|reddit\.com|x\.com|twitter\.com|bsky\.app|youtube\.com|youtu\.be|github\.com|gitlab\.com|arxiv\.org|wikipedia\.org|google\.com|linkedin\.com|facebook\.com|instagram\.com|tiktok\.com|apple\.com|amazon\.com|huggingface\.co|archive\.org|archive\.ph)$/i

/** The host of a link worth looking for a blog's feed on, or nothing. */
export const blogHost = (url: string | null | undefined) => {
  const host = url ? hostOf(url) : undefined
  return host && !NOT_BLOGS.test(host) ? host : undefined
}

// The tech blogs are always in Blogs; other packs' publishers only come with their topics.
const rssOf = (ids?: string[]) => TOPICS.filter((t) => (ids ? ids.includes(t.id) : isTechTopic(t.id))).flatMap((t) => t.feeds.flatMap((f) => (f.kind === 'rss' ? [f.url] : [])))
const BUILT_IN = rssOf()
const BUILT_IN_HOSTS = new Set(BUILT_IN.map(hostOf).filter((h): h is string => !!h))

/** Hosts whose feeds you already get: the built-in blogs, your topics' publishers and the ones you follow. */
export function useFollowedHosts(): Set<string> {
  const custom = usePrefs((p) => p.customFeeds)
  const followed = usePrefs((p) => p.followed)
  return useMemo(
    () => new Set([...BUILT_IN_HOSTS, ...rssOf(followed).map(hostOf), ...custom.flatMap((f) => [hostOf(f.url), f.site && bare(f.site)])].filter((h): h is string => !!h)),
    [custom, followed],
  )
}

export const isFollowed = (feed: FoundFeed, hosts: Set<string>) =>
  BUILT_IN.includes(feed.url) || usePrefs.getState().customFeeds.some((f) => f.url === feed.url) || (!feed.format && (hosts.has(bare(feed.site)) || hosts.has(hostOf(feed.url) ?? '')))

export const findFeeds = (url: string) => feed('discover', { url }) as Promise<FoundFeed[]>

const DAY = 86_400_000
const discoverQuery = (url: string) => ({ queryKey: keys.discover(url), queryFn: () => findFeeds(url), staleTime: 7 * DAY, gcTime: 30 * DAY, retry: false })

/** A page's feeds: different publications can share a host. */
export function useSiteFeeds(url: string | null | undefined, enabled = true) {
  const host = blogHost(url)
  return useQuery({ ...discoverQuery(url ?? ''), enabled: enabled && !!host })
}

/** What following more says once your feeds are full. */
export const FEEDS_FULL = 'Your feeds are full: unfollow one under Settings, Sources to follow another'

export function follow(feed: FoundFeed) {
  const { customFeeds, set } = usePrefs.getState()
  if (customFeeds.some((f) => f.url === feed.url)) return
  const { feeds, left } = addFeeds(customFeeds, [{ url: feed.url, label: feed.title, site: feed.site, ...(feed.format ? { format: feed.format } : {}) }])
  if (left) return toast(FEEDS_FULL, { tone: 'error' })
  set({ customFeeds: feeds })
  toast(`Following ${feed.title}. New posts show in ${followsTech(usePrefs.getState().followed) ? 'Blogs' : 'Publishers'}.`, {
    action: { label: 'Undo', run: () => usePrefs.getState().set({ customFeeds: usePrefs.getState().customFeeds.filter((f) => f.url !== feed.url) }) },
  })
}

/** How many stories from a site make it one you keep reading. */
const KEEP_READING = 3

/** Blogs you keep opening stories from but don't follow, with their feeds, most read first. */
export function useSuggestedBlogs(limit = 6) {
  const sites = useActivity((a) => a.sites)
  const hosts = useFollowedHosts()
  const picks = useMemo(
    () =>
      Object.entries(sites)
        .filter(([host, v]) => v.keys.length >= KEEP_READING && Date.now() - v.last < 60 * DAY && blogHost(v.url) && !hosts.has(bare(host)))
        .sort((a, b) => b[1].keys.length - a[1].keys.length || b[1].last - a[1].last)
        .slice(0, limit),
    [sites, hosts, limit],
  )
  const found = useQueries({ queries: picks.map(([, v]) => discoverQuery(v.url)) })
  return picks.map(([host, v], i) => ({ host, read: v.keys.length, feed: found[i].data?.find((f) => !isFollowed(f, hosts)), pending: found[i].isPending })).filter((s) => s.feed || s.pending)
}
