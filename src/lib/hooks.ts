import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Channel } from './channels'
import { allTopics, findTopic } from './channels'
import { useLibrary } from './library'
import { merge, type Ranked, type SortMode } from './rank'
import { spicyOrder, useSpiceStore, wantSpice } from './spice'
import { blueskyEnabled, feedId, feedLabel, fetchArticle, fetchFeed, fetchThread, findDiscussions, storyFromKey } from './sources'
import { useActivity, usePrefs } from './store'
import { moderateStory } from './moderation'
import { matchesTopic, storyText, type FeedRef } from './topics'
import type { Story } from './types'

/** Every story we've seen this session, so the pane can open any key instantly. */
const storyIndex = new Map<string, Ranked>()
export const indexedStories = () => [...storyIndex.values()]

export interface FeedStatus {
  ref: FeedRef
  id: string
  label: string
  status: 'pending' | 'error' | 'success'
  count: number
  error?: string
  fetching: boolean
}

export function useBlueskyEnabled(): boolean | undefined {
  return useQuery({ queryKey: ['bluesky-status'], queryFn: blueskyEnabled, staleTime: 60 * 60_000 }).data
}

/**
 * The same sources, newest first: Latest asks each for its newest posts, not its front page in
 * another order, so it's a true timeline and doesn't miss what hasn't caught on yet.
 */
export function latestFeed(ref: FeedRef): FeedRef {
  switch (ref.kind) {
    case 'hn':
      return ref.list === 'top' || ref.list === 'best' ? { ...ref, list: 'new' } : ref
    case 'lobsters':
      return ref.path === 'hottest' || ref.path === 'active' ? { ...ref, path: 'newest' } : ref
    case 'frontpage':
    case 'paperwing':
      return 'feed' in ref ? { ...ref, feed: 'new' } : { ...ref, sort: 'new' }
    case 'lemmy':
      return { ...ref, sort: 'New' }
    default:
      return ref
  }
}

/** The feeds a channel reads in this sort. Bluesky feeds only once the deployment says it can serve them. */
export function channelFeeds(channel: Channel | undefined, sort: SortMode, bluesky: boolean | undefined): FeedRef[] {
  const latest = sort === 'new' && !channel?.native
  return (channel?.feeds ?? []).filter((f) => bluesky === true || f.kind !== 'bluesky').map((f) => (latest ? latestFeed(f) : f))
}

export function useChannelFeed(channel: Channel | undefined, sort: SortMode) {
  // Bluesky feeds only run once the deployment says it can serve them.
  const bluesky = useBlueskyEnabled()
  const latest = sort === 'new' && !channel?.native
  // Only Latest reads other feeds: Hot, Top and Spicy rank the same ones, so changing between them fetches nothing.
  const feeds = useMemo(() => channelFeeds(channel, latest ? 'new' : 'hot', bluesky), [channel, bluesky, latest])
  const queries = useQueries({
    queries: feeds.map((ref) => ({
      queryKey: ['feed', feedId(ref)],
      queryFn: () => fetchFeed(ref),
    })),
  })
  const { mutedWords, mutedDomains, interests, labelers, warnings } = usePrefs()
  const hidden = useActivity((s) => s.hidden)
  const extraTopics = useMemo(() => allTopics(interests).filter((t) => t.id.startsWith('q:')), [interests])

  const dataStamp = queries.map((q) => q.dataUpdatedAt).join(',')
  // Rows are memoised, but ranking builds every story afresh: hand back the previous object when
  // nothing about a story changed, so changing the sort or a feed arriving only renders what's new.
  const previous = useRef(new Map<string, { json: string; story: Ranked }>())
  const stories = useMemo(() => {
    const batches = feeds.map((ref, i) => {
      const data = queries[i]?.data ?? []
      // Keyword searches are noisy; keep only results that actually match the topic (or any of the topics) they were run for.
      const ids = 'topic' in ref && ref.topic ? [ref.topic] : 'topics' in ref && ref.topics ? ref.topics : []
      const topics = ids.map((id) => findTopic(id, interests)).filter((t) => !!t)
      const kept = topics.length ? data.filter((s) => topics.some((t) => matchesTopic(t, storyText(s)))) : data
      // Labels and content warnings, judged against your labelers (moderation.ts).
      return kept.flatMap((s) => moderateStory(s, labelers, warnings) ?? [])
    })
    // Impressions, votes and taste are read once per recompute, not subscribed to: scrolling or
    // voting never reorders the list under you. The next refresh or visit reflects them.
    const { impressions: seen, votes } = useActivity.getState()
    const { affinity } = usePrefs.getState()
    const fresh = merge(batches, { sort, native: channel?.native, boost: channel?.boost, extraTopics, filters: { mutedWords, mutedDomains, hidden }, seen, affinity, votes })
    const kept = previous.current
    if (kept.size > 3000) kept.clear()
    const merged = fresh.map((s) => {
      const json = JSON.stringify(s)
      const before = kept.get(s.key)
      if (before?.json === json) return before.story
      kept.set(s.key, { json, story: s })
      return s
    })
    for (const s of merged) {
      storyIndex.set(s.key, s)
      for (const c of s.coverage ?? []) if (!storyIndex.has(c.key)) storyIndex.set(c.key, { ...c, heat: 0.4, alsoOn: [], topics: s.topics })
    }
    return merged
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataStamp, feeds, sort, mutedWords, mutedDomains, hidden, extraTopics, interests, labelers, warnings])

  // Spicy: every story in the feed is asked about (not just the rows on screen), and the list
  // reorders as grades come in.
  const spicy = sort === 'spicy'
  const grades = useSpiceStore((s) => (spicy ? s.grades : undefined))
  useEffect(() => {
    if (spicy) for (const s of stories) for (const p of [s, ...s.alsoOn]) wantSpice(p)
  }, [spicy, stories])
  const ordered = useMemo(() => (grades ? spicyOrder(stories, grades) : stories), [stories, grades])

  const statuses: FeedStatus[] = feeds.map((ref, i) => ({
    ref,
    id: feedId(ref),
    label: feedLabel(ref),
    status: queries[i]?.status ?? 'pending',
    count: queries[i]?.data?.length ?? 0,
    error: queries[i]?.error?.message,
    fetching: queries[i]?.isFetching ?? false,
  }))

  return {
    stories: ordered,
    statuses,
    loading: queries.length > 0 && queries.every((q) => q.isPending),
    fetching: queries.some((q) => q.isFetching),
    refetch: () => queries.forEach((q) => q.refetch()),
    updatedAt: Math.max(0, ...queries.map((q) => q.dataUpdatedAt)),
  }
}

const POST_GC = 15 * 60_000

export function useThread(key: string, enabled: boolean) {
  const getSaved = useLibrary((s) => s.get)
  return useQuery({
    queryKey: ['thread', key],
    enabled,
    staleTime: 2 * 60_000,
    // Threads and articles are the big entries. Keep them long enough to flip back and forth,
    // not for days: phones run out of memory long before the cache would expire.
    gcTime: POST_GC,
    queryFn: async () => {
      try {
        return await fetchThread(key)
      } catch (err) {
        const saved = await getSaved(key)
        if (saved?.thread) return saved.thread
        throw err
      }
    },
  })
}

export function useArticle(url: string | null | undefined, key: string, enabled: boolean) {
  const getSaved = useLibrary((s) => s.get)
  return useQuery({
    queryKey: ['article', url],
    enabled: enabled && !!url,
    staleTime: Infinity,
    gcTime: POST_GC,
    retry: false,
    queryFn: async () => {
      const saved = await getSaved(key)
      if (saved?.article) return saved.article
      return fetchArticle(url!)
    },
  })
}

export function useDiscussions(url: string | null | undefined, enabled = true) {
  return useQuery({ queryKey: ['discussions', url], enabled: enabled && !!url, staleTime: 10 * 60_000, queryFn: () => findDiscussions(url!) })
}

/** Resolves a key to a story from the session index, a saved copy, or the key itself. */
export function useStory(key: string): Story | undefined {
  const savedMeta = useLibrary((s) => s.items[key])
  return storyIndex.get(key) ?? savedMeta?.story ?? storyFromKey(key)
}

export function indexStory(s: Story) {
  if (!storyIndex.has(s.key)) storyIndex.set(s.key, { ...s, heat: 0.4, alsoOn: [], topics: [] })
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine)

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

/** Re-renders every minute so relative times stay honest. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
