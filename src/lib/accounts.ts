import { useMemo } from 'react'
import { useAtproto } from './atproto'
import { react, useReactions, type ComposeTarget, type ShareNetwork } from './compose'
import { hnVote, useHn } from './hnAccount'
import { lemmyVote, useLemmyAccount } from './lemmyAccount'
import { canFavourite, canPostToMastodon, favourite, useMastodon } from './mastodon'
import { keyId, parseStoryKey } from './storyKey'
import type { Comment, Story } from './types'

// Network accounts: where the reader is signed in, and what that lets them do to a story or a
// comment. The rules (signed in there? allowed to post? is it their own? which id to act on?) live
// here once; the row's up arrow, comment actions, the reader's reply button and the share sheet all
// ask this module instead of each reading the account stores their own way.
//
// The rules are pure functions of plain facts (Accounts), so they're tested without any store;
// useAccounts() is the one place those facts are read from the stores. Each network's transport
// stays in its own module (hnAccount, lemmyAccount, mastodon, atproto); castVote and useVoted
// route to them.

/** Where the reader is signed in, as facts. A network is present only when its sign-in is usable. */
export interface Accounts {
  bluesky?: { did: string; handle?: string }
  hn?: { user: string }
  mastodon?: { instance: string; acct: string; canPost: boolean; canFavourite: boolean }
  lemmy?: { user: string; instance: string }
}

/** What the up arrow also does where the story lives. */
export type VoteTarget =
  | { network: 'hn'; id: string; label: string }
  | { network: 'bluesky' | 'frontpage'; kind: 'like' | 'vote'; subject: { uri: string; cid: string }; label: string }
  | { network: 'mastodon'; key: string; label: string }
  | { network: 'lemmy'; apId: string; kind: 'post' | 'comment'; label: string }

/** Lemmy shows remote users as name@instance and local ones bare: either is you. */
const isLemmyMe = (user: string, author?: string) => author === user || !!author?.startsWith(`${user}@`)

/** The vote the up arrow casts on the story's own network, if the reader can vote there. Never on their own posts. */
export function storyVote(a: Accounts, s: Story): VoteTarget | undefined {
  if (s.source === 'hn') {
    const id = keyId(s.key, 'hn')
    return a.hn && id && s.author !== a.hn.user ? { network: 'hn', id, label: 'Upvote on Hacker News' } : undefined
  }
  if (s.source === 'bluesky' || s.source === 'frontpage') {
    if (!a.bluesky || !s.ref || s.ref.uri.split('/')[2] === a.bluesky.did || s.author === a.bluesky.handle) return undefined
    if (s.source === 'frontpage') return { network: 'frontpage', kind: 'vote', subject: s.ref, label: 'Upvote on Frontpage' }
    return { network: 'bluesky', kind: 'like', subject: s.ref, label: s.sourceLabel === 'PaperWing' ? 'Upvote on PaperWing (a Bluesky like)' : 'Like on Bluesky' }
  }
  if (s.source === 'mastodon') {
    // Only statuses read through your own server carry its ids.
    const p = parseStoryKey(s.key)
    return a.mastodon?.canFavourite && p?.kind === 'md' && p.instance === a.mastodon.instance ? { network: 'mastodon', key: s.key, label: 'Favourite on Mastodon' } : undefined
  }
  if (s.source === 'lemmy') {
    return a.lemmy && s.discussionUrl && !isLemmyMe(a.lemmy.user, s.author) ? { network: 'lemmy', apId: s.discussionUrl, kind: 'post', label: 'Upvote on Lemmy' } : undefined
  }
  return undefined
}

export type Network = keyof Accounts

/** Who the reader is signed in as on a network, as that network shows it; undefined when they aren't (or the sign-in has lapsed). */
export function signedInAs(a: Accounts, network: Network): string | undefined {
  switch (network) {
    case 'bluesky':
      return a.bluesky && (a.bluesky.handle ? `@${a.bluesky.handle}` : a.bluesky.did)
    case 'hn':
      return a.hn?.user
    case 'mastodon':
      return a.mastodon && `@${a.mastodon.acct}`
    case 'lemmy':
      return a.lemmy?.user
  }
}

/** Can the reader post anywhere at all (for the share button)? */
const canPostSomewhere = (a: Accounts) => !!(a.bluesky || a.hn || a.mastodon?.canPost || a.lemmy)

/**
 * In the reader: a reply or comment where the story lives (Bluesky needs the post's own record,
 * `root`), and whether it can be shared anywhere.
 */
export function storyActions(a: Accounts, s: Story, root?: { uri: string; cid: string }): { reply?: ComposeTarget; share: boolean } {
  const share = canPostSomewhere(a) && !!(s.url || s.discussionUrl)
  const hnId = keyId(s.key, 'hn')
  if (s.source === 'hn' && a.hn && hnId) return { share, reply: { kind: 'hn-reply', threadKey: s.key, parent: hnId, story: true, to: s.author } }
  if (s.source === 'lemmy' && a.lemmy && s.discussionUrl) return { share, reply: { kind: 'lemmy-reply', threadKey: s.key, postApId: s.discussionUrl, to: s.author } }
  if (s.source === 'bluesky' && a.bluesky && root) return { share, reply: { kind: 'bsky-reply', threadKey: s.key, root, parent: root, to: s.author ?? '' } }
  if (s.source === 'frontpage' && a.bluesky && root) return { share, reply: { kind: 'fp-comment', threadKey: s.key, post: root, to: s.author } }
  return { share }
}

export interface CommentRules {
  /** What a vote on a comment is here: a like, a Frontpage vote, an HN or a Lemmy upvote. */
  kind: 'like' | 'vote' | 'hn' | 'lemmy'
  canReply: (c: Comment) => boolean
  reply: (c: Comment) => ComposeTarget | undefined
  canVote: (c: Comment) => boolean
  vote: (c: Comment) => VoteTarget | undefined
}

/** A comment being sent shows at once with a local id; it can't be replied to or voted on until it's real. */
const pending = (c: Comment) => c.id.startsWith('local-') || !!c.deleted

/** What the reader can do to a thread's comments, or undefined when they can't write to it. */
export function commentActions(a: Accounts, s: Story, root?: { uri: string; cid: string }): CommentRules | undefined {
  if (s.source === 'hn') {
    const me = a.hn?.user
    if (!me) return undefined
    const vote = (c: Comment): VoteTarget | undefined => (pending(c) || c.author === me ? undefined : { network: 'hn', id: c.id, label: 'Upvote on Hacker News' })
    return {
      kind: 'hn',
      canReply: (c) => !pending(c),
      reply: (c) => (pending(c) ? undefined : { kind: 'hn-reply', threadKey: s.key, parent: c.id, story: false, to: c.author }),
      canVote: (c) => !!vote(c),
      vote,
    }
  }
  if (s.source === 'lemmy') {
    const me = a.lemmy?.user
    const post = s.discussionUrl
    if (!me || !post) return undefined
    const vote = (c: Comment): VoteTarget | undefined => (pending(c) || !c.url || isLemmyMe(me, c.author) ? undefined : { network: 'lemmy', apId: c.url, kind: 'comment', label: 'Upvote on Lemmy' })
    return {
      kind: 'lemmy',
      canReply: (c) => !pending(c) && !!c.url,
      reply: (c) => (pending(c) || !c.url ? undefined : { kind: 'lemmy-reply', threadKey: s.key, postApId: post, parentApId: c.url, parentId: c.id, to: c.author }),
      canVote: (c) => !!vote(c),
      vote,
    }
  }
  if (!a.bluesky || !root || (s.source !== 'bluesky' && s.source !== 'frontpage')) return undefined
  const kind = s.source === 'bluesky' ? 'like' : 'vote'
  const network = s.source
  const vote = (c: Comment): VoteTarget | undefined => (pending(c) || !c.ref ? undefined : { network, kind, subject: c.ref, label: kind === 'like' ? 'Like on Bluesky' : 'Upvote on Frontpage' })
  return {
    kind,
    canReply: (c) => !pending(c) && !!c.ref,
    reply: (c) =>
      pending(c) || !c.ref
        ? undefined
        : network === 'bluesky'
          ? { kind: 'bsky-reply', threadKey: s.key, root, parent: c.ref, to: c.author }
          : { kind: 'fp-comment', threadKey: s.key, post: root, parent: c.ref, to: c.author },
    canVote: (c) => !!vote(c),
    vote,
  }
}

/** Each network the share sheet can post to, and why not where it can't. `communities`: Lemmy communities joined. */
export function shareTargets(a: Accounts, s: Story, communities: number): { network: ShareNetwork; ok: boolean; why?: string }[] {
  const fromHn = s.source === 'hn'
  return [
    { network: 'bluesky', ok: !!a.bluesky, why: 'Sign in with Bluesky' },
    // Re-submitting an HN story to HN only finds the same thread.
    { network: 'hn', ok: !!a.hn && !fromHn, why: fromHn ? 'Already on Hacker News' : 'Sign in to Hacker News' },
    { network: 'mastodon', ok: !!a.mastodon?.canPost, why: a.mastodon ? 'Allow posting under Settings' : 'Sign in to Mastodon' },
    { network: 'lemmy', ok: !!a.lemmy && communities > 0, why: a.lemmy ? 'Join a community first' : 'Sign in to Lemmy' },
  ]
}

/* --------------------------------------------------------------- adapters */

/** The reader's accounts, from the stores: the one place that knows which store holds which sign-in. */
export function useAccounts(): Accounts {
  const did = useAtproto((s) => s.did)
  const handle = useAtproto((s) => s.handle)
  const hnUser = useHn((s) => (s.cookie ? s.user : undefined))
  const mdInstance = useMastodon((s) => s.instance)
  const mdAcct = useMastodon((s) => (s.token ? s.acct : undefined))
  const mdPost = useMastodon(canPostToMastodon)
  const mdFav = useMastodon(canFavourite)
  const lmUser = useLemmyAccount((s) => (s.jwt ? s.user : undefined))
  const lmInstance = useLemmyAccount((s) => s.instance)
  return useMemo(
    () => ({
      bluesky: did ? { did, handle } : undefined,
      hn: hnUser ? { user: hnUser } : undefined,
      mastodon: mdAcct ? { instance: mdInstance, acct: mdAcct, canPost: mdPost, canFavourite: mdFav } : undefined,
      lemmy: lmUser && lmInstance ? { user: lmUser, instance: lmInstance } : undefined,
    }),
    [did, handle, hnUser, mdInstance, mdAcct, mdPost, mdFav, lmUser, lmInstance],
  )
}

/** Whether the reader has already cast this vote. */
export function useVoted(t: VoteTarget | undefined): boolean {
  const hn = useHn((s) => t?.network === 'hn' && !!s.votes[t.id])
  const reacted = useReactions((s) => (t?.network === 'bluesky' || t?.network === 'frontpage') && !!s.made[t.subject.uri])
  const md = useMastodon((s) => t?.network === 'mastodon' && !!s.favourites?.[t.key])
  const lm = useLemmyAccount((s) => t?.network === 'lemmy' && !!s.votes[t.apId])
  return hn || reacted || md || lm
}

/** Casts the vote, or takes it back, through that network's account. */
export function castVote(t: VoteTarget, on: boolean): Promise<unknown> {
  switch (t.network) {
    case 'hn':
      return hnVote(t.id)
    case 'bluesky':
    case 'frontpage':
      return react(t.kind, t.subject)
    case 'mastodon':
      return favourite(t.key, on)
    case 'lemmy':
      return lemmyVote(t.apId, t.kind)
  }
}
