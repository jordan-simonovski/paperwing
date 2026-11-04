import { usePrefs, type LemmyCommunity } from './store'
import { getJson } from './sources/http'
import { toast } from './ui'
import { lemmyFollow, useLemmyAccount } from './lemmyAccount'

// Finding more to read: Lemmy communities (the open web's subreddits, through lemmy.world, which
// federates nearly all of them, PieFed and Mbin included) and Bluesky's community-run feeds.
// Both are public APIs, fetched straight from the browser.

const LEMMY = 'https://lemmy.world'

export interface CommunityHit extends LemmyCommunity {
  description?: string
  subscribers: number
  /** People who posted or commented in the last month: how alive it is. */
  active: number
}

interface CommunityView {
  community: { name: string; title: string; actor_id: string; icon?: string; description?: string; nsfw: boolean; removed: boolean; deleted: boolean }
  counts: { subscribers: number; users_active_month: number }
}

const fullName = (c: CommunityView['community']) => `${c.name}@${new URL(c.actor_id).hostname}`

const hit = (v: CommunityView): CommunityHit => ({
  name: fullName(v.community),
  title: v.community.title,
  icon: v.community.icon,
  description:
    v.community.description
      ?.replace(/[#*_>[\]()`]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200) || undefined,
  subscribers: v.counts.subscribers,
  active: v.counts.users_active_month,
})

const usable = (v: CommunityView) => !v.community.nsfw && !v.community.removed && !v.community.deleted

/** The liveliest communities right now, or the ones matching a search. */
export async function findCommunities(q: string): Promise<CommunityHit[]> {
  const query = q.trim()
  if (!query) {
    const { communities } = await getJson<{ communities: CommunityView[] }>(`${LEMMY}/api/v3/community/list?type_=All&sort=Hot&limit=40`)
    return communities.filter(usable).map(hit)
  }
  const qs = new URLSearchParams({ q: query, type_: 'Communities', listing_type: 'All', sort: 'TopAll', limit: '40' })
  const { communities } = await getJson<{ communities: CommunityView[] }>(`${LEMMY}/api/v3/search?${qs}`)
  // Most active first: a big community nobody posts in any more is a museum.
  return communities
    .filter(usable)
    .map(hit)
    .sort((a, b) => b.active - a.active || b.subscribers - a.subscribers)
}

export const joined = (name: string) => usePrefs.getState().communities.some((c) => c.name === name)

export function toggleCommunity(c: LemmyCommunity) {
  const { communities, set } = usePrefs.getState()
  const leaving = communities.some((x) => x.name === c.name)
  if (leaving) set({ communities: communities.filter((x) => x.name !== c.name) })
  else set({ communities: [...communities, { name: c.name, title: c.title, icon: c.icon }] })
  // Signed in to Lemmy, joining here joins on your account too.
  const account = !!useLemmyAccount.getState().jwt
  if (account) lemmyFollow(c.name, !leaving).catch((err: Error) => toast(`Changed here, but not on your Lemmy account: ${err.message}`, { tone: 'error' }))
  if (!leaving) toast(`Joined c/${c.name.split('@')[0]}${account ? ' here and on your Lemmy account' : ''}. It's under Communities, and in Lemmy.`)
}

export interface FeedHit {
  uri: string
  name: string
  by: string
  likes: number
  description?: string
  avatar?: string
}

/** Bluesky's most-liked community feeds, or the ones matching a search. */
export async function findBlueskyFeeds(q: string): Promise<FeedHit[]> {
  const qs = new URLSearchParams({ limit: '40' })
  if (q.trim()) qs.set('query', q.trim())
  const { feeds } = await getJson<{ feeds: { uri: string; displayName: string; creator: { handle: string }; likeCount?: number; description?: string; avatar?: string }[] }>(
    `https://public.api.bsky.app/xrpc/app.bsky.unspecced.getPopularFeedGenerators?${qs}`,
  )
  return feeds.map((f) => ({ uri: f.uri, name: f.displayName, by: f.creator.handle, likes: f.likeCount ?? 0, description: f.description?.replace(/\s+/g, ' ').slice(0, 200), avatar: f.avatar }))
}

export function toggleBlueskyFeed(f: { uri: string; name: string }, onOpen?: () => void) {
  const { bskyFeeds, set } = usePrefs.getState()
  if (bskyFeeds.some((x) => x.uri === f.uri)) set({ bskyFeeds: bskyFeeds.filter((x) => x.uri !== f.uri) })
  else {
    set({ bskyFeeds: [...bskyFeeds, { uri: f.uri, name: f.name }] })
    toast(`Added ${f.name}. Find it in Explore, Bluesky feeds.`, { action: onOpen ? { label: 'Open feed', run: onOpen } : undefined })
  }
}
