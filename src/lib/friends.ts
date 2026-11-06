import { keys } from './query'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { canReadTimeline, useAtproto } from './atproto'
import { friendsByLink, linkId, TOOK_PART, type Friend } from './sources/bluesky'
import { bskyPostUrl } from './bskyPost'
import { parseStoryKey } from './storyKey'
import type { Story } from './types'

// "People you follow shared this": your Bluesky timeline, turned into who you follow has posted,
// quoted, replied about or reposted each link lately (sources/bluesky.ts), shown on matching stories
// in any feed. Read straight from Bluesky in your browser; nothing about it reaches PaperWing's server.

export type { Friend }

export function useFriendMap() {
  const did = useAtproto((a) => a.did)
  const allowed = useAtproto((a) => canReadTimeline(a.scope))
  return useQuery({ queryKey: keys.friends(did), queryFn: friendsByLink, enabled: !!did && allowed !== false, staleTime: 5 * 60_000, retry: 1 })
}

// ponytail: the first 1,000 accounts you follow (ten pages); read further if people follow more and miss blogs.
const FOLLOW_PAGES = 10

/** Everyone you follow on Bluesky (their DIDs), read from Bluesky's public API in your browser; nothing about it reaches PaperWing's server. */
async function follows(did: string): Promise<string[]> {
  const out: string[] = []
  let cursor: string | undefined
  for (let page = 0; page < FOLLOW_PAGES; page++) {
    const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.graph.getFollows?actor=${encodeURIComponent(did)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    if (!res.ok) throw new Error(`Bluesky answered ${res.status}`)
    const body = (await res.json()) as { follows?: { did?: string }[]; cursor?: string }
    for (const f of body.follows ?? []) if (typeof f.did === 'string') out.push(f.did)
    cursor = body.cursor
    if (!cursor || !body.follows?.length) break
  }
  return out
}

/** The accounts you follow on Bluesky, when you're signed in: empty otherwise, and while they load. */
export function useFollowing(): Set<string> {
  const did = useAtproto((a) => a.did)
  const { data } = useQuery({ queryKey: keys.following(did), queryFn: () => follows(did!), enabled: !!did, staleTime: 60 * 60_000, retry: 1 })
  return useMemo(() => new Set(data ?? []), [data])
}

/**
 * Who you follow took part in any of these links, each person once at what they did that says
 * most (across every copy of the link), the most worth reading first.
 */
export function friendsFor(map: Record<string, Friend[]>, urls: string[]): Friend[] {
  const best = new Map<string, Friend>()
  for (const u of urls)
    for (const f of map[linkId(u)] ?? []) {
      const seen = best.get(f.handle)
      if (!seen || TOOK_PART[f.how] < TOOK_PART[seen.how]) best.set(f.handle, f)
    }
  return [...best.values()].sort((a, b) => TOOK_PART[a.how] - TOOK_PART[b.how])
}

/** Who you follow took part in this story's link (or the same link elsewhere). */
export function useFriendsOf(story: Pick<Story, 'url' | 'sharedBy'> & { alsoOn?: Pick<Story, 'url'>[] }): Friend[] {
  const { data } = useFriendMap()
  // The Following channel already says who shared each story.
  if (!data || story.sharedBy?.length) return []
  return friendsFor(
    data,
    [story.url, ...(story.alsoOn ?? []).map((s) => s.url)].filter((u): u is string => !!u),
  )
}

/** A conversation someone you follow started about the link: their own post or quote, as a place it's being discussed. */
export function friendPlace(f: Friend): Story | undefined {
  if (!f.post || (f.how !== 'quoted' && f.how !== 'posted')) return undefined
  const p = parseStoryKey(f.post)
  if (p?.kind !== 'bs') return undefined
  return {
    key: f.post,
    source: 'bluesky',
    sourceLabel: f.name ?? `@${f.handle}`,
    title: f.text || `${f.name ?? `@${f.handle}`} on Bluesky`,
    url: null,
    discussionUrl: bskyPostUrl(f.handle, p.uri),
    author: f.handle,
    score: f.likes,
    comments: f.replies ?? 0,
    createdAt: f.at ?? 0,
    hasThread: true,
  }
}
