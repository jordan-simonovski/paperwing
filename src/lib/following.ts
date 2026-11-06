import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useAtproto } from './atproto'
import { keys } from './query'

// Who you follow on Bluesky, for Explore's open web directory: read only there (not on the feed's
// first screen), straight from Bluesky's public API in your browser.

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

/** The accounts you follow on Bluesky when you're signed in (empty otherwise, or if Bluesky can't say), and whether they're still loading. */
export function useFollowing(): { following: Set<string>; loading: boolean } {
  const did = useAtproto((a) => a.did)
  const { data, isPending } = useQuery({ queryKey: keys.following(did), queryFn: () => follows(did!), enabled: !!did, staleTime: 60 * 60_000, retry: false })
  const following = useMemo(() => new Set(data ?? []), [data])
  return { following, loading: !!did && isPending }
}
