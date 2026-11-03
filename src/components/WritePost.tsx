import { useQueryClient } from '@tanstack/react-query'
import { Link2, Loader2, PenLine, Send } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { canUpdate, canWrite, useAtproto } from '../lib/atproto'
import { useComposer } from '../lib/compose'
import { BODY_LIMIT, SUBMISSION_NSID } from '../lib/paperwing'
import { keys } from '../lib/query'
import { editSelfPost, saveWords, withSelfPost, WordsNotSaved, writeSelfPost, type PendingSelfPost } from '../lib/selfPost'
import type { Story, Thread } from '../lib/types'
import { toast } from '../lib/ui'
import { BoardPicker, useBoardShut } from './BoardPicker'
import { MarkdownEditor } from './MarkdownEditor'
import { Sheet } from './Sheet'

/**
 * Write a post: a title and words in Markdown, listed on PaperWing (a board, or the front page)
 * like a link. Its Bluesky post carries the title and a snippet. Given a post of yours, it edits
 * the words instead; the title stays, as it's the Bluesky post's.
 */
export function WritePost({ board: given, edit, onClose }: { board?: string; edit?: Story; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { did, scope } = useAtproto()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState(edit?.selfPost?.body ?? '')
  const [board, setBoard] = useState(given ?? '')
  const [front, setFront] = useState(false)
  const [busy, setBusy] = useState(false)
  // The Bluesky post is up but its words didn't save: Post now saves only the words, never a second post.
  const [pending, setPending] = useState<PendingSelfPost>()
  const { shut } = useBoardShut(board)
  const allowed = edit ? canUpdate(scope, SUBMISSION_NSID) !== false : canWrite(scope, SUBMISSION_NSID) !== false
  const over = body.trim().length > BODY_LIMIT
  // Saving the same words again isn't an edit.
  const changed = !edit || body.trim() !== edit.selfPost?.body
  const ready = !!did && allowed && !!body.trim() && !over && changed && (!!edit || !!pending || (!!title.trim() && !shut))

  const submit = async () => {
    if (!ready || busy) return
    setBusy(true)
    try {
      if (edit?.ref) {
        await editSelfPost(edit.ref.uri, body)
        // The thread on screen shows the new words now; PaperWing records the version when it next reads them.
        const words = body.trim()
        qc.setQueryData<Thread | null>(keys.thread(edit.key), (t) =>
          t?.story.selfPost && t.story.selfPost.body !== words
            ? { ...t, story: withSelfPost(t.story, { body: words, versions: [...t.story.selfPost.versions, { body: words, seenAt: Date.now() }], editedAt: Date.now() }) }
            : t,
        )
        toast('Saved')
        onClose()
      } else {
        const { key, story } = pending ? await saveWords(pending, body) : await writeSelfPost({ title, body, board: board || undefined, front: board.startsWith('at://') && front })
        // Bluesky takes a moment to have it: show the post straight away.
        qc.setQueryData<Thread>(keys.thread(key), { story, comments: [] })
        onClose()
        toast('Posted to PaperWing')
        void navigate(`/t/paperwing/${key}`)
      }
    } catch (err) {
      if (err instanceof WordsNotSaved) setPending(err.pending)
      toast((err as Error).message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} side="bottom" label={edit ? 'Edit your post' : 'Write a post'}>
      <form
        className="space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="flex items-center gap-2">
          <h2 className="flex flex-1 items-center gap-2 text-[1.0625rem] font-bold">
            <PenLine size={17} /> {edit ? 'Edit your post' : 'Write a post'}
          </h2>
          {!edit && (
            <button type="button" className="btn h-8 px-3 text-[0.8125rem]" onClick={() => useComposer.getState().open({ kind: 'post-link', board: given })}>
              <Link2 size={14} /> Post a link instead
            </button>
          )}
        </div>

        {!did ? (
          <p className="rounded-xl bg-sunk px-3.5 py-3 text-[0.9375rem]">
            Posts go out from your Bluesky account.{' '}
            <Link to="/settings/sources" className="font-semibold underline underline-offset-2" onClick={onClose}>
              Sign in with Bluesky
            </Link>
          </p>
        ) : (
          !allowed && (
            <p className="rounded-xl bg-sunk px-3.5 py-3 text-[0.9375rem]">
              {edit ? 'Editing' : 'Posting'} needs one more Bluesky permission.{' '}
              <Link to="/settings/sources" className="font-semibold underline underline-offset-2" onClick={onClose}>
                Allow it under Settings, Sources
              </Link>
            </p>
          )
        )}

        {edit ? (
          <div className="rounded-xl bg-sunk px-3.5 py-2.5">
            <p className="text-[0.9375rem] font-semibold">{edit.title}</p>
            <p className="text-[0.8125rem] text-ink-3">The title stays: it’s your Bluesky post’s. Everyone can see earlier versions of the words.</p>
          </div>
        ) : (
          <label className="block space-y-1">
            <span className="text-[0.8125rem] font-semibold text-ink-2">Title</span>
            <input className="input" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} placeholder="What’s it about?" autoFocus disabled={!!pending} />
          </label>
        )}

        <MarkdownEditor value={body} onChange={setBody} label="Your post" placeholder="Say what you want to say. Markdown works." autoFocus={!!edit} />
        {over && <p className="text-[0.8125rem] text-signal">That’s over {BODY_LIMIT.toLocaleString()} characters.</p>}

        {pending && (
          <p className="rounded-xl bg-sunk px-3.5 py-3 text-[0.875rem]" role="status">
            Your Bluesky post is up, but its words didn’t save. Save them again: it won’t post twice.
          </p>
        )}

        {!edit && !pending && did && allowed && (
          <div className="rounded-xl bg-sunk px-3.5 py-3">
            <p className="mb-2 text-[0.8125rem] text-ink-3">Your Bluesky post has the title, the start of your words and a link here. Likes are its votes, replies its comments.</p>
            <BoardPicker board={board} onBoard={setBoard} front={front} onFront={setFront} />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!ready || busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />} {edit ? 'Save' : pending ? 'Save the words' : 'Post'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
