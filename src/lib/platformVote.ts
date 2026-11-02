import { keyId, parseStoryKey } from './storyKey'
import { useAtproto } from './atproto'
import { react, useReactions } from './compose'
import { hnVote, useHn } from './hnAccount'
import { canFavourite, favourite, useMastodon } from './mastodon'
import { lemmyVote, useLemmyAccount } from './lemmyAccount'
import type { Story } from './types'

// The up arrow on a story is "more like this" here, and, when you're signed in where the story
// lives, a real vote there too: an HN upvote, a Bluesky like (PaperWing's votes are likes), a
// Frontpage vote, a Mastodon favourite, a Lemmy upvote. Never on your own posts.

export interface PlatformVote {
  /** Voted there already. */
  on: boolean
  /** What the arrow does there, for its label. */
  label: string
  toggle: () => Promise<unknown>
}

/** A Mastodon story read through this server (only those carry its ids). */
const isFrom = (key: string, instance: string) => {
  const p = parseStoryKey(key)
  return p?.kind === 'md' && p.instance === instance
}

export function usePlatformVote(s: Story): PlatformVote | undefined {
  const hnUser = useHn((h) => h.user)
  const hnId = keyId(s.key, 'hn')
  const hnOn = useHn((h) => !!hnId && !!h.votes[hnId])
  const atDid = useAtproto((a) => a.did)
  const atHandle = useAtproto((a) => a.handle)
  const reacted = useReactions((r) => !!s.ref && !!r.made[s.ref.uri])
  const mdOk = useMastodon(canFavourite)
  const mdOn = useMastodon((m) => !!m.favourites?.[s.key])
  const mdInstance = useMastodon((m) => m.instance)
  const lmUser = useLemmyAccount((l) => (l.jwt ? l.user : undefined))
  const lmOn = useLemmyAccount((l) => !!s.discussionUrl && !!l.votes[s.discussionUrl])

  if (s.source === 'hn' && hnId && hnUser && s.author !== hnUser) return { on: hnOn, label: 'Upvote on Hacker News', toggle: () => hnVote(hnId) }
  if ((s.source === 'bluesky' || s.source === 'frontpage') && atDid && s.ref && s.ref.uri.split('/')[2] !== atDid && s.author !== atHandle) {
    const kind = s.source === 'bluesky' ? 'like' : 'vote'
    return {
      on: reacted,
      label: s.source === 'bluesky' ? (s.sourceLabel === 'PaperWing' ? 'Upvote on PaperWing (a Bluesky like)' : 'Like on Bluesky') : 'Upvote on Frontpage',
      toggle: () => react(kind, s.ref!),
    }
  }
  if (s.source === 'mastodon' && mdOk && isFrom(s.key, mdInstance)) return { on: mdOn, label: 'Favourite on Mastodon', toggle: () => favourite(s.key, !mdOn) }
  if (s.source === 'lemmy' && lmUser && s.discussionUrl && !s.author?.startsWith(`${lmUser}@`) && s.author !== lmUser)
    return { on: lmOn, label: 'Upvote on Lemmy', toggle: () => lemmyVote(s.discussionUrl!, 'post') }
  return undefined
}
