import { keys } from './query'
import { useQuery } from '@tanstack/react-query'
import { canReadTimeline, useAtproto } from './atproto'
import { friendsByLink, linkId, TOOK_PART, type Friend } from './sources/bluesky'
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

/** Who you follow took part in this story's link (or the same link elsewhere), each once, the most worth reading first. */
export function useFriendsOf(story: Pick<Story, 'url' | 'sharedBy'> & { alsoOn?: Pick<Story, 'url'>[] }): Friend[] {
  const { data } = useFriendMap()
  // The Following channel already says who shared each story.
  if (!data || story.sharedBy?.length) return []
  const urls = [story.url, ...(story.alsoOn ?? []).map((s) => s.url)].filter((u): u is string => !!u)
  const seen = new Set<string>()
  const out: Friend[] = []
  for (const u of urls) for (const f of data[linkId(u)] ?? []) if (!seen.has(f.handle) && seen.add(f.handle)) out.push(f)
  return out.sort((a, b) => TOOK_PART[a.how] - TOOK_PART[b.how])
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
    discussionUrl: `https://bsky.app/profile/${f.handle}/post/${p.uri.split('/').pop()}`,
    author: f.handle,
    score: f.likes,
    comments: f.replies ?? 0,
    createdAt: f.at ?? 0,
    hasThread: true,
  }
}
