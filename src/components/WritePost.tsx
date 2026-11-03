import { useQueryClient } from '@tanstack/react-query'
import { Link2, Loader2, PenLine, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { canUpdate, canUpload, canWrite, useAtproto } from '../lib/atproto'
import { useComposer } from '../lib/compose'
import { BODY_LIMIT, SUBMISSION_NSID } from '../lib/paperwing'
import { keys } from '../lib/query'
import { editSelfPost, saveWords, withSelfPost, WordsNotSaved, writeSelfPost, type ContentLabel, type PendingSelfPost } from '../lib/selfPost'
import { usePrefs } from '../lib/store'
import type { Story, Thread } from '../lib/types'
import { toast } from '../lib/ui'
import { BoardPicker, useBoardShut } from './BoardPicker'
import { MarkdownEditor } from './MarkdownEditor'
import { PicturePicker, type Picture } from './PicturePicker'
import { Sheet } from './Sheet'

/**
 * Write a post: a title and words in Markdown, and up to four pictures, listed on PaperWing (a
 * board, or the front page) like a link. Its Bluesky post carries the title, a snippet and the
 * pictures. Given a post of yours, it edits the words instead; the title and pictures stay, as
 * they're the Bluesky post's.
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
  const [pictures, setPictures] = useState<Picture[]>([])
  const [label, setLabel] = useState<ContentLabel | ''>('')
  // The previews are this device's copies: let them go with the sheet (a posted story has its own).
  const shown = useRef(pictures)
  shown.current = pictures
  useEffect(() => () => shown.current.forEach((p) => URL.revokeObjectURL(p.url)), [])
  const requireAlt = usePrefs((p) => p.requireAlt)
  const { shut, name: boardName, noImages } = useBoardShut(board)
  const undescribed = requireAlt && pictures.some((p) => !p.alt.trim())
  const noPicturesHere = noImages && pictures.length > 0
  const allowed = edit ? canUpdate(scope, SUBMISSION_NSID) !== false : canWrite(scope, SUBMISSION_NSID) !== false
  const uploads = canUpload(scope) !== false
  const over = body.trim().length > BODY_LIMIT
  // Saving the same words again isn't an edit.
  const changed = !edit || body.trim() !== edit.selfPost?.body
  // Words, pictures, or both: with pictures, the words are optional (saving a picture post's listing again too).
  const something = !!body.trim() || (!edit && (pending ? !!pending.media?.length : pictures.length > 0))
  const ready = !!did && allowed && something && !over && changed && (!!edit || !!pending || (!!title.trim() && !shut && !undescribed && !noPicturesHere))

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
        const { key, story } = pending
          ? await saveWords(pending, body)
          : await writeSelfPost({ title, body, board: board || undefined, front: board.startsWith('at://') && front, images: pictures, requireAlt, label: label || undefined })
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

        {!edit &&
          !pending &&
          did &&
          allowed &&
          (uploads ? (
            <PicturePicker pictures={pictures} onChange={setPictures} label={label} onLabel={setLabel} requireAlt={requireAlt} />
          ) : (
            <p className="text-[0.8125rem] text-ink-3">
              Pictures need one more Bluesky permission.{' '}
              <Link to="/settings/sources" className="underline underline-offset-2" onClick={onClose}>
                Allow pictures under Settings, Sources
              </Link>
            </p>
          ))}
        {/* No link to the setting: following it would close this sheet and lose the post. */}
        {undescribed && <p className="text-[0.8125rem] text-ink-3">Describe every picture to post it. (Alt text is required under Settings, Sources, Posting.)</p>}
        {noPicturesHere && <p className="text-[0.8125rem] text-signal">{boardName ?? 'This board'} takes no pictures: remove them, or pick another board.</p>}

        {pending && (
          <p className="rounded-xl bg-sunk px-3.5 py-3 text-[0.875rem]" role="status">
            Your Bluesky post is up, but its words didn’t save. Save them again: it won’t post twice.
          </p>
        )}

        {!edit && !pending && did && allowed && (
          <div className="rounded-xl bg-sunk px-3.5 py-3">
            <p className="mb-2 text-[0.8125rem] text-ink-3">
              Your Bluesky post has the title, {pictures.length ? 'your pictures' : 'the start of your words'} and a link here. Likes are its votes, replies its comments.
            </p>
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
