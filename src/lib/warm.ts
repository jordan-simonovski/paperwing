import { canReadTimeline, useAtproto } from './atproto'
import { resolveChannel } from './channels'
import { channelFeeds } from './hooks'
import { useMastodon } from './mastodon'
import { queryClient } from './query'
import type { SortMode } from './rank'
import { feedId, fetchFeed } from './sources'
import { usePrefs } from './store'

/**
 * Starts the requests for the feed you're opening before the app renders: on phones the launch
 * splash holds the first render back for a couple of seconds so it can fly smoothly, and the feed
 * shouldn't wait on it. Builds the channel the way FeedPage does, so the queries are the same ones
 * it will ask for (and finds in flight or done). Bluesky feeds wait for the app, as they wait on
 * the deployment saying it can serve them.
 */
export function prefetchLandingFeed() {
  const m = location.pathname.match(/^\/(?:t\/([^/]+)(?:\/[^/]*)?)?\/?$/)
  if (!m) return
  const p = usePrefs.getState()
  if (!p.welcomed) return
  const params = new URLSearchParams(location.search)
  const atproto = useAtproto.getState()
  const channel = resolveChannel(m[1] ? decodeURIComponent(m[1]) : 'for-you', params.get('v') ?? undefined, {
    followed: p.followed,
    interests: p.interests,
    customFeeds: p.customFeeds,
    bskyFeeds: p.bskyFeeds,
    communities: p.communities,
    mixes: p.mixes,
    followedMixes: p.followedMixes,
    people: p.people,
    boards: p.boards,
    releaseRepos: p.releaseRepos,
    mastodon: !!useMastodon.getState().acct,
    bluesky: !!atproto.did,
    blueskyTimeline: canReadTimeline(atproto.scope),
    statusHosts: p.statusPages.map((s) => s.host),
  })
  const sort = (params.get('sort') as SortMode | null) ?? (p.feedOrder === 'latest' ? 'new' : 'hot')
  for (const ref of channelFeeds(channel, sort, false)) void queryClient.prefetchQuery({ queryKey: ['feed', feedId(ref)], queryFn: () => fetchFeed(ref) })
}
