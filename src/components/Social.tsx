import { keyId } from '../lib/storyKey'
import { ArrowBigUp, Heart, MessageSquareReply, Send } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAtproto } from '../lib/atproto'
import { hnVote, useHn } from '../lib/hnAccount'
import { lemmyVote, useLemmyAccount } from '../lib/lemmyAccount'
import { react, useComposer, useReactions } from '../lib/compose'
import { canPostToMastodon, useMastodon } from '../lib/mastodon'
import type { Comment, Story } from '../lib/types'
import { toast } from '../lib/ui'

// The buttons that write to the open network, shown once signed in with Bluesky (atproto.ts):
// reply and like on Bluesky, comment and upvote on Frontpage, post any story to Bluesky.

export type ReactKind = 'like' | 'vote'

/** Like (Bluesky) or upvote (Frontpage) a post or comment; again takes it back. */
export function ReactButton({ kind, subject, small }: { kind: ReactKind; subject: { uri: string; cid: string }; small?: boolean }) {
  const done = useReactions((r) => !!r.made[subject.uri])
  const [busy, setBusy] = useState(false)
  const label = kind === 'like' ? (done ? 'Liked' : 'Like') : done ? 'Upvoted' : 'Upvote'
  return (
    <button
      className={small ? `cmt-act${done ? ' on' : ''}` : `pill${done ? ' on' : ''}`}
      aria-pressed={done}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation()
        setBusy(true)
        react(kind, subject)
          .catch((err: Error) => toast(err.message, { tone: 'error' }))
          .finally(() => setBusy(false))
      }}
    >
      {kind === 'like' ? <Heart size={small ? 13 : 15} fill={done ? 'currentColor' : 'none'} /> : <ArrowBigUp size={small ? 15 : 17} fill={done ? 'currentColor' : 'none'} />}
      {label}
    </button>
  )
}

/** Upvote a Hacker News story or comment through your HN account; again takes it back. */
export function HnVoteButton({ id, small }: { id: string; small?: boolean }) {
  const done = useHn((h) => !!h.votes[id])
  const [busy, setBusy] = useState(false)
  return (
    <button
      className={small ? `cmt-act${done ? ' on' : ''}` : `pill${done ? ' on' : ''}`}
      aria-pressed={done}
      disabled={busy}
      title={done ? 'Take back your upvote on Hacker News' : 'Upvote on Hacker News'}
      onClick={(e) => {
        e.stopPropagation()
        setBusy(true)
        hnVote(id)
          .catch((err: Error) => toast(err.message, { tone: 'error' }))
          .finally(() => setBusy(false))
      }}
    >
      <ArrowBigUp size={small ? 15 : 17} fill={done ? 'currentColor' : 'none'} />
      {done ? 'Upvoted' : 'Upvote'}
    </button>
  )
}

/** Upvote a Lemmy comment through your Lemmy account; again takes it back. */
export function LemmyVoteButton({ apId, small }: { apId: string; small?: boolean }) {
  const done = useLemmyAccount((l) => !!l.votes[apId])
  const [busy, setBusy] = useState(false)
  return (
    <button
      className={small ? `cmt-act${done ? ' on' : ''}` : `pill${done ? ' on' : ''}`}
      aria-pressed={done}
      disabled={busy}
      title={done ? 'Take back your upvote on Lemmy' : 'Upvote on Lemmy'}
      onClick={(e) => {
        e.stopPropagation()
        setBusy(true)
        lemmyVote(apId, 'comment')
          .catch((err: Error) => toast(err.message, { tone: 'error' }))
          .finally(() => setBusy(false))
      }}
    >
      <ArrowBigUp size={small ? 15 : 17} fill={done ? 'currentColor' : 'none'} />
      {done ? 'Upvoted' : 'Upvote'}
    </button>
  )
}

/** What a thread's comments can do: reply, and like or vote (on Hacker News, through your HN account). */
export interface CommentActions {
  reply: (c: Comment) => void
  kind: ReactKind | 'hn' | 'lemmy'
  /** Your own handle there: no voting on your own comments. */
  me?: string
}

/** For a story's thread, when signed in and it's a thread we can write to. */
export function useCommentActions(story: Story, root?: { uri: string; cid: string }): CommentActions | undefined {
  const signedIn = useAtproto((a) => !!a.did)
  const hnUser = useHn((h) => h.user)
  const lmUser = useLemmyAccount((l) => (l.jwt ? l.user : undefined))
  const open = useComposer((c) => c.open)
  const { key, source, discussionUrl } = story
  const uri = root?.uri
  const cid = root?.cid
  // Stable while nothing changes: every comment in the thread reads it.
  return useMemo((): CommentActions | undefined => {
    if (source === 'hn')
      return hnUser ? { kind: 'hn', me: hnUser, reply: (c) => !c.id.startsWith('local-') && open({ kind: 'hn-reply', threadKey: key, parent: c.id, story: false, to: c.author }) } : undefined
    if (source === 'lemmy')
      return lmUser && discussionUrl
        ? {
            kind: 'lemmy',
            me: lmUser,
            reply: (c) => c.url && !c.id.startsWith('local-') && open({ kind: 'lemmy-reply', threadKey: key, postApId: discussionUrl, parentApId: c.url, parentId: c.id, to: c.author }),
          }
        : undefined
    if (!signedIn || !uri || !cid) return undefined
    const ref = { uri, cid }
    if (source === 'bluesky') return { kind: 'like', reply: (c) => c.ref && open({ kind: 'bsky-reply', threadKey: key, root: ref, parent: c.ref, to: c.author }) }
    if (source === 'frontpage') return { kind: 'vote', reply: (c) => c.ref && open({ kind: 'fp-comment', threadKey: key, post: ref, parent: c.ref, to: c.author }) }
    return undefined
  }, [signedIn, hnUser, lmUser, uri, cid, key, source, discussionUrl, open])
}

/**
 * In the reader, beside the votes: reply or comment where the story lives, and share it anywhere
 * you're signed in. Upvoting is the vote arrows themselves (Votes), which vote on the story's own
 * network when you're signed in there.
 */
export function StoryActions({ story, root }: { story: Story; root?: { uri: string; cid: string } }) {
  const signedIn = useAtproto((a) => !!a.did)
  const hnUser = useHn((h) => h.user)
  const mdPost = useMastodon(canPostToMastodon)
  const lmUser = useLemmyAccount((l) => (l.jwt ? l.user : undefined))
  const open = useComposer((c) => c.open)
  const canShare = (signedIn || !!hnUser || mdPost || !!lmUser) && !!(story.url || story.discussionUrl)
  return (
    <>
      {story.source === 'hn' && hnUser && (
        <button className="pill" onClick={() => open({ kind: 'hn-reply', threadKey: story.key, parent: keyId(story.key, 'hn') ?? '', story: true, to: story.author })}>
          <MessageSquareReply size={15} /> Comment
        </button>
      )}
      {signedIn && story.source === 'bluesky' && root && (
        <button className="pill" onClick={() => open({ kind: 'bsky-reply', threadKey: story.key, root, parent: root, to: story.author ?? '' })}>
          <MessageSquareReply size={15} /> Reply
        </button>
      )}
      {signedIn && story.source === 'frontpage' && root && (
        <button className="pill" onClick={() => open({ kind: 'fp-comment', threadKey: story.key, post: root, to: story.author })}>
          <MessageSquareReply size={15} /> Comment
        </button>
      )}
      {story.source === 'lemmy' && lmUser && story.discussionUrl && (
        <button className="pill" onClick={() => open({ kind: 'lemmy-reply', threadKey: story.key, postApId: story.discussionUrl!, to: story.author })}>
          <MessageSquareReply size={15} /> Comment
        </button>
      )}
      {canShare && (
        <button className="pill" onClick={() => open({ kind: 'share', story })} title="Share to Bluesky and PaperWing, Hacker News or Mastodon">
          <Send size={14} /> Share
        </button>
      )}
    </>
  )
}
