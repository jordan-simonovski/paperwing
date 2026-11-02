import { useQuery, type QueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { words } from './cluster'
import { keys } from './query'
import { api } from './sources/http'
import type { Story } from './types'

// How a story is being covered: the same event from other publishers, found by searching the
// news for the headline's distinctive words (names, places, numbers), then kept only when their
// headlines share enough of those words and ran within a few days. Ground News-style, minus the
// bias ratings: who said what is shown side by side, and the reader judges.

/** The words a search for this event should use: names and numbers first, then the longest others. */
export function coverageQuery(title: string): string | undefined {
  const ws = words(title)
  const named = ws.filter((w) => w.entity).map((w) => w.token)
  const rest = ws
    .filter((w) => !w.entity)
    .map((w) => w.token)
    .sort((a, b) => b.length - a.length)
  const picked = [...named, ...rest].slice(0, 5)
  return picked.length >= 2 ? picked.join(' ') : undefined
}

const DAY = 86_400_000

/** Search results that are this story's event: enough shared words, close in time, not the story itself. */
export function sameEvent(story: Pick<Story, 'title' | 'url' | 'createdAt'>, found: Story[]): Story[] {
  const mine = new Set(words(story.title).map((w) => w.token))
  const seenSites = new Set<string>()
  return found.filter((s) => {
    if (s.url && s.url === story.url) return false
    if (Math.abs(s.createdAt - story.createdAt) > 4 * DAY) return false
    const theirs = words(s.title).map((w) => w.token)
    const shared = theirs.filter((t) => mine.has(t)).length
    if (shared < 2 || shared / Math.min(mine.size, theirs.length || 1) < 0.34) return false
    // One headline per publisher.
    const site = s.site ?? s.sourceLabel
    if (seenSites.has(site)) return false
    seenSites.add(site)
    return true
  })
}

export function useCoverage(story: Story | undefined, enabled: boolean) {
  const q = story ? coverageQuery(story.title) : undefined
  return useQuery({
    queryKey: keys.coverage(story?.key),
    queryFn: async () => sameEvent(story!, (await api('feed', { src: 'news', q: q! })) as Story[]),
    enabled: enabled && !!q,
    staleTime: 15 * 60_000,
    retry: false,
  })
}

/** Stories that are news: a link from a publisher or a social post. HN and the like are mostly blogs and repos. */
export const newsLike = (s: Pick<Story, 'url' | 'source'>) => !!s.url && (s.source === 'rss' || s.source === 'lemmy' || s.source === 'bluesky' || s.source === 'mastodon')

const outletOf = (s: Pick<Story, 'site' | 'sourceLabel' | 'url'>) => {
  if (s.site) return s.site
  try {
    return s.url ? new URL(s.url).hostname.replace(/^www\./, '') : s.sourceLabel
  } catch {
    return s.sourceLabel
  }
}

/** Everyone covering a story: what the feed grouped with it plus search results, and how many publishers that is (its own included). */
function outletsFrom(story: Story | undefined, grouped: Story[], found: Story[] = []) {
  const seen = new Set([story?.url, ...grouped.map((c) => c.url)])
  const stories = [...grouped, ...found.filter((s) => !seen.has(s.url) && !!seen.add(s.url))]
  const outlets = new Set([story ? outletOf(story) : undefined, ...stories.map(outletOf)].filter(Boolean)).size
  return { stories, outlets }
}

/** Everyone covering a story: what the feed grouped with it, plus a news search for it. */
export function useOutlets(story: Story | undefined, grouped: Story[] = []) {
  const found = useCoverage(story, !!story && newsLike(story))
  const { stories, outlets } = useMemo(() => outletsFrom(story, grouped, found.data), [story, grouped, found.data])
  return { stories, outlets, searching: found.isFetching }
}

/**
 * The same for a feed row, which never starts a search and only reads one already done (when the
 * story was opened). Not a query subscription: fifty rows each registering one made the query
 * cache, and so its saved copy, churn on every list change.
 */
export function rowOutlets(qc: QueryClient, story: Story, grouped: Story[] = []) {
  return outletsFrom(story, grouped, qc.getQueryData<Story[]>(keys.coverage(story.key)))
}
