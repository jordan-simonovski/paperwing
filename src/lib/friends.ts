import { keys } from './query'
import { useQuery } from '@tanstack/react-query'
import { canReadTimeline, useAtproto } from './atproto'
import { friendsByLink, linkId, type Friend } from './sources/bluesky'
import type { Story } from './types'

// "People you follow shared this": your Bluesky timeline, turned into who you follow has shared or
// discussed each link lately (sources/bluesky.ts), shown on matching stories in any feed. Read
// straight from Bluesky in your browser; nothing about it reaches PaperWing's server.

export type { Friend }

export function useFriendMap() {
  const did = useAtproto((a) => a.did)
  const allowed = useAtproto((a) => canReadTimeline(a.scope))
  return useQuery({ queryKey: keys.friends(did), queryFn: friendsByLink, enabled: !!did && allowed !== false, staleTime: 5 * 60_000, retry: 1 })
}

/** Who you follow shared or discussed this story's link (or the same link elsewhere), sharers first. */
export function useFriendsOf(story: Pick<Story, 'url' | 'sharedBy'> & { alsoOn?: Pick<Story, 'url'>[] }): Friend[] {
  const { data } = useFriendMap()
  // The Following channel already says who shared each story.
  if (!data || story.sharedBy?.length) return []
  const urls = [story.url, ...(story.alsoOn ?? []).map((s) => s.url)].filter((u): u is string => !!u)
  const seen = new Set<string>()
  const out: Friend[] = []
  for (const u of urls) for (const f of data[linkId(u)] ?? []) if (!seen.has(f.handle) && seen.add(f.handle)) out.push(f)
  return out
}
