import type { QueryClient } from '@tanstack/react-query'
import { planChannel } from './channelFeed'
import { keys } from './query'
import type { SortMode } from './rank'
import { readReader } from './reader'
import { fetchFeed } from './sources'
import { usePrefs } from './store'

/**
 * Starts the requests for the feed you're opening before the app renders: on phones the launch
 * splash holds the first render back for a couple of seconds so it can fly smoothly, and the feed
 * shouldn't wait on it. Planned by the channel feed module, so these are the very queries the page
 * will ask for (and finds in flight or done). Bluesky feeds wait for the app, as they wait on the
 * deployment saying it can serve them.
 */
export function prefetchLandingFeed(qc: QueryClient) {
  const m = location.pathname.match(/^\/(?:t\/([^/]+)(?:\/[^/]*)?)?\/?$/)
  if (!m || !usePrefs.getState().welcomed) return
  const params = new URLSearchParams(location.search)
  const sort = (params.get('sort') as SortMode | null) ?? (usePrefs.getState().feedOrder === 'latest' ? 'new' : 'hot')
  const plan = planChannel(readReader(), m[1] ? decodeURIComponent(m[1]) : 'for-you', { variant: params.get('v') ?? undefined, sort, blueskyEnabled: false })
  for (const f of plan?.feeds ?? []) void qc.prefetchQuery({ queryKey: keys.feed(f.id), queryFn: () => fetchFeed(f.ref) })
}
