import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { canReadTimeline, useAtproto } from './atproto'
import type { Reader, Taste } from './channelFeed'
import { useMastodon } from './mastodon'
import { useActivity, usePrefs, type Prefs } from './store'

// The reader, as the channel feed module sees them, built from the app's stores. The only place
// that knows which store each fact lives in: pages ask for a reader, never for the stores.

type ReaderPrefs = Pick<
  Prefs,
  | 'followed'
  | 'interests'
  | 'customFeeds'
  | 'bskyFeeds'
  | 'communities'
  | 'mixes'
  | 'followedMixes'
  | 'people'
  | 'boards'
  | 'releaseRepos'
  | 'statusPages'
  | 'mutedWords'
  | 'mutedDomains'
  | 'labelers'
  | 'warnings'
>

const pickPrefs = (p: Prefs): ReaderPrefs => ({
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
  statusPages: p.statusPages,
  mutedWords: p.mutedWords,
  mutedDomains: p.mutedDomains,
  labelers: p.labelers,
  warnings: p.warnings,
})

/** Read at ranking time, not subscribed to: voting or scrolling never reorders the list on screen. */
const taste = (): Taste => {
  const { impressions, votes } = useActivity.getState()
  return { seen: impressions, affinity: usePrefs.getState().affinity, votes }
}

function toReader(p: ReaderPrefs, hidden: Record<string, number>, bluesky: { did?: string; scope?: string }, mastodon: { instance: string; signedIn: boolean }): Reader {
  const { statusPages, ...rest } = p
  return {
    ...rest,
    statusHosts: statusPages.map((s) => s.host),
    hidden,
    bluesky: bluesky.did ? { did: bluesky.did, timeline: canReadTimeline(bluesky.scope) } : undefined,
    mastodon,
    taste,
  }
}

/** The reader as they are right now, outside React (the launch warm-up, a topic card's preview). */
export function readReader(): Reader {
  const a = useAtproto.getState()
  const m = useMastodon.getState()
  return toReader(pickPrefs(usePrefs.getState()), useActivity.getState().hidden, a, { instance: m.instance, signedIn: !!m.acct })
}

/** The reader, kept current: a new one whenever something a channel or its ranking depends on changes. */
export function useReader(): Reader {
  const prefs = usePrefs(useShallow(pickPrefs))
  const hidden = useActivity((s) => s.hidden)
  const did = useAtproto((s) => s.did)
  const scope = useAtproto((s) => s.scope)
  const instance = useMastodon((s) => s.instance)
  const signedIn = useMastodon((s) => !!s.acct)
  return useMemo(() => toReader(prefs, hidden, { did, scope }, { instance, signedIn }), [prefs, hidden, did, scope, instance, signedIn])
}
