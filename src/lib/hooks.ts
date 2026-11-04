import { useQueries, useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { planChannel, rankChannel, type PlannedFeed } from './channelFeed'
import { useLibrary } from './library'
import { keys } from './query'
import type { Ranked, SortMode } from './rank'
import { useReader } from './reader'
import { spicyOrder, useSpiceStore, wantSpice } from './spice'
import { blueskyEnabled, feedLabel, fetchArticle, fetchFeed, fetchThread, findDiscussions, storyFromKey } from './sources'
import type { FeedRef } from './topics'
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
  return useQuery({ queryKey: keys.blueskyStatus, queryFn: blueskyEnabled, staleTime: 60 * 60_000 }).data
}

/**
 * How a channel's feeds are fetched: the real sources in the app, canned stories in a test or a
 * story (see inMemoryFeeds). The port between the channel feed and the network.
 */
export type FeedFetcher = (ref: FeedRef) => Promise<Story[]>
export const FeedFetcherContext = createContext<FeedFetcher>(fetchFeed)

/** A fetcher that answers from stories you hand it, by feed label; anything else comes back empty. */
export const inMemoryFeeds =
  (byLabel: Record<string, Story[]>): FeedFetcher =>
  async (ref) =>
    byLabel[feedLabel(ref)] ?? []

/**
 * A channel's stories for the reader, fetched through the query cache and ranked by the channel
 * feed module (channelFeed.ts). Undefined channel when there's no such channel.
 */
export function useChannelFeed(channelId: string, opts: { variant?: string; sort: SortMode; publisherFormat?: 'standard' }) {
  const reader = useReader()
  const fetcher = useContext(FeedFetcherContext)
  const blueskyEnabled = useBlueskyEnabled() === true
  const { variant, sort, publisherFormat } = opts
  const plan = useMemo(() => planChannel(reader, channelId, { variant, sort, blueskyEnabled, publisherFormat }), [reader, channelId, variant, sort, blueskyEnabled, publisherFormat])
  const feeds = plan?.feeds ?? NO_FEEDS
  const queries = useQueries({ queries: feeds.map((f) => ({ queryKey: keys.feed(f.id), queryFn: () => fetcher(f.ref) })) })
  // Header, keyboard and pull gestures share the whole refresh, including sources that finish early.
  const refreshing = useRef<{ key: string; promise: Promise<unknown> } | null>(null)
  const refetch = () => {
    const key = JSON.stringify(feeds.map((f) => f.id))
    if (refreshing.current?.key === key) return refreshing.current.promise
    const promise = Promise.all(queries.map((q) => q.refetch({ cancelRefetch: false })))
    const pending = { key, promise }
    refreshing.current = pending
    const clear = () => {
      if (refreshing.current === pending) refreshing.current = null
    }
    void promise.then(clear, clear)
    return promise
  }

  const dataStamp = queries.map((q) => q.dataUpdatedAt).join(',')
  // Rows are memoised, but ranking builds every story afresh: hand back the previous object when
  // nothing about a story changed, so changing the sort or a feed arriving only renders what's new.
  const previous = useRef(new Map<string, { json: string; story: Ranked }>())
  const stories = useMemo(() => {
    if (!plan) return []
    const fresh = rankChannel(
      plan,
      reader,
      queries.map((q) => q.data),
      // When each feed was fetched: a feed restored from the cache keeps its old time (momentum.ts).
      queries.map((q) => q.dataUpdatedAt),
    )
    const kept = previous.current
    if (kept.size > 3000) kept.clear()
    const ranked = fresh.map((s) => {
      const json = JSON.stringify(s)
      const before = kept.get(s.key)
      if (before?.json === json) return before.story
      kept.set(s.key, { json, story: s })
      return s
    })
    for (const s of ranked) {
      storyIndex.set(s.key, s)
      for (const c of s.coverage ?? []) if (!storyIndex.has(c.key)) storyIndex.set(c.key, { ...c, heat: 0.4, alsoOn: [], topics: s.topics })
    }
    return ranked
    // `queries` is a new array every render; its data changes are what dataStamp tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataStamp, plan, reader])

  // Spicy: every story in the feed is asked about (not just the rows on screen), and the list
  // reorders as grades come in.
  const spicy = sort === 'spicy'
  const grades = useSpiceStore((s) => (spicy ? s.grades : undefined))
  useEffect(() => {
    if (spicy) for (const s of stories) for (const p of [s, ...s.alsoOn]) wantSpice(p)
  }, [spicy, stories])
  const ordered = useMemo(() => (grades ? spicyOrder(stories, grades) : stories), [stories, grades])

  const statuses: FeedStatus[] = feeds.map((f, i) => ({
    ref: f.ref,
    id: f.id,
    label: f.label,
    status: queries[i]?.status ?? 'pending',
    count: queries[i]?.data?.length ?? 0,
    error: queries[i]?.error?.message,
    fetching: queries[i]?.isFetching ?? false,
  }))

  return {
    channel: plan?.channel,
    stories: ordered,
    statuses,
    loading: queries.length > 0 && queries.every((q) => q.isPending),
    fetching: queries.some((q) => q.isFetching),
    refetch,
    updatedAt: Math.max(0, ...queries.map((q) => q.dataUpdatedAt)),
  }
}
const NO_FEEDS: PlannedFeed[] = []

const POST_GC = 15 * 60_000

export function useThread(key: string, enabled: boolean) {
  const getSaved = useLibrary((s) => s.get)
  return useQuery({
    queryKey: keys.thread(key),
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
    queryKey: keys.article(url),
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
  return useQuery({ queryKey: keys.discussions(url), enabled: enabled && !!url, staleTime: 10 * 60_000, queryFn: () => findDiscussions(url!) })
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
