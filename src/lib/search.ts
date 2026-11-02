import { keys } from './query'
import type { QueryClient } from '@tanstack/react-query'
import { hnSearch } from './sources/hn'
import { api } from './sources/http'
import { blueskyEnabled } from './sources/bluesky'
import { lemmySearch } from './sources/lemmy'
import { mastodonTags } from './sources/mastodon'
import type { Story } from './types'
import { TOPIC_BY_ID } from './topics'

// Search fans out to every source that can search, and to every story already loaded in the
// reader's feeds, which covers the sources that can't (Lobsters, dev.to, blogs, releases). Each
// source answers on its own, so the fast ones show first.

export interface SearchOptions {
  days?: number
  sort: 'top' | 'new'
}

export interface SearchSource {
  id: string
  label: string
  run: (q: string, opts: SearchOptions, qc: QueryClient) => Promise<Story[]>
}

const words = (q: string) =>
  q
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1)
const within = (days?: number) => (s: Story) => !days || Date.now() - s.createdAt < days * 86_400_000

/** Stories from feeds already loaded on this device whose title (or site) has every word. */
export function searchLoaded(qc: QueryClient, q: string, days?: number): Story[] {
  const ws = words(q)
  if (!ws.length) return []
  const seen = new Map<string, Story>()
  for (const query of qc.getQueryCache().findAll({ queryKey: keys.feeds })) {
    for (const s of (query.state.data as Story[] | undefined) ?? []) {
      if (seen.has(s.key)) continue
      const text = `${s.title} ${s.url ?? ''} ${s.sourceLabel}`.toLowerCase()
      if (ws.every((w) => text.includes(w))) seen.set(s.key, s)
    }
  }
  return [...seen.values()].filter(within(days))
}

export const SEARCH_SOURCES: SearchSource[] = [
  { id: 'hn', label: 'Hacker News', run: (q, o) => hnSearch(q, { sort: o.sort === 'new' ? 'date' : 'relevance', days: o.days, limit: 50 }) },
  {
    id: 'bluesky',
    label: 'Bluesky',
    run: async (q, o) => ((await blueskyEnabled()) ? ((await api('atproto', { route: 'search', q, days: o.days, sort: o.sort })) as Story[]) : []),
  },
  { id: 'lemmy', label: 'Lemmy', run: (q, o) => lemmySearch(q, o.days, o.sort).then((r) => r.filter(within(o.days))) },
  {
    // Mastodon only searches hashtags without signing in, so a one-word search reads that tag.
    id: 'mastodon',
    label: 'Mastodon',
    run: async (q, o) => {
      const tag = q.trim().replace(/^#/, '')
      return /^[\p{L}\p{N}_]+$/u.test(tag) ? (await mastodonTags([tag])).filter(within(o.days)) : []
    },
  },
  { id: 'loaded', label: 'Your feeds', run: async (q, o, qc) => searchLoaded(qc, q, o.days) },
]

/** Things worth searching for, drawn from the topics this reader follows (a plain word each), or a broad few for a newcomer. */
export function searchIdeas(followed: string[], limit = 5): string[] {
  const ideas: string[] = []
  for (const id of followed) {
    const term = TOPIC_BY_ID.get(id)?.terms.find((t) => /^[a-z][a-z0-9 ]{2,}$/i.test(t))
    if (term && !ideas.includes(term.toLowerCase())) ideas.push(term.toLowerCase())
    if (ideas.length === limit) break
  }
  return ideas.length >= 2 ? ideas : ['climate', 'space telescope', 'open source', 'sourdough', 'elections'].slice(0, limit)
}
