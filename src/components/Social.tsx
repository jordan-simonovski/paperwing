import { ArrowBigUp, Heart, MessageSquareReply, Send } from 'lucide-react'
import { useMemo, useState } from 'react'
import { castVote, commentActions, storyActions, useAccounts, useVoted, type CommentRules, type VoteTarget } from '../lib/accounts'
import { useComposer } from '../lib/compose'
import type { Story } from '../lib/types'
import { toast } from '../lib/ui'

// The buttons that act where a story lives: vote on a story or comment, reply or comment, and
// share. What the reader can do, and where, comes from the accounts module (accounts.ts).

/** A vote where the story or comment lives: a Bluesky like, a Frontpage, HN or Lemmy upvote, a Mastodon favourite. Again takes it back. */
export function VoteButton({ target, small }: { target: VoteTarget; small?: boolean }) {
  const done = useVoted(target)
  const [busy, setBusy] = useState(false)
  const like = target.network === 'bluesky'
  const label = like ? (done ? 'Liked' : 'Like') : done ? 'Upvoted' : 'Upvote'
  return (
    <button
      className={small ? `cmt-act${done ? ' on' : ''}` : `pill${done ? ' on' : ''}`}
      aria-pressed={done}
      disabled={busy}
      title={done ? `Take back: ${target.label}` : target.label}
      onClick={(e) => {
        e.stopPropagation()
        setBusy(true)
        castVote(target, !done)
          .catch((err: Error) => toast(err.message, { tone: 'error' }))
          .finally(() => setBusy(false))
      }}
    >
      {like ? <Heart size={small ? 13 : 15} fill={done ? 'currentColor' : 'none'} /> : <ArrowBigUp size={small ? 15 : 17} fill={done ? 'currentColor' : 'none'} />}
      {label}
    </button>
  )
}

/** What the reader can do to this story's comments (undefined when they can't write to its thread). */
export function useCommentActions(story: Story | undefined, root?: { uri: string; cid: string }): CommentRules | undefined {
  const accounts = useAccounts()
  const uri = root?.uri
  const cid = root?.cid
  // Stable while nothing changes: every comment in the thread reads it.
  return useMemo(() => (story ? commentActions(accounts, story, uri && cid ? { uri, cid } : undefined) : undefined), [accounts, story, uri, cid])
}

/**
 * In the reader, beside the votes: reply or comment where the story lives, and share it anywhere
 * you're signed in. Upvoting is the vote arrows themselves (Votes), which vote on the story's own
 * network when you're signed in there.
 */
export function StoryActions({ story, root }: { story: Story; root?: { uri: string; cid: string } }) {
  const { reply, share } = storyActions(useAccounts(), story, root)
  const open = useComposer((c) => c.open)
  const replyLabel = story.source === 'bluesky' ? 'Reply' : 'Comment'
  return (
    <>
      {reply && (
        <button className="pill" onClick={() => open(reply)}>
          <MessageSquareReply size={15} /> {replyLabel}
        </button>
      )}
      {share && (
        <button className="pill" onClick={() => open({ kind: 'share', story })} title="Share to Bluesky and PaperWing, Hacker News or Mastodon">
          <Send size={14} /> Share
        </button>
      )}
    </>
  )
}
