import { Highlighter, Loader2, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { useAtproto } from '../lib/atproto'
import { timeAgo } from '../lib/format'
import { addNote, findQuote, removeNote, tidy, useMarginNotes } from '../lib/notes'
import { profilePath } from '../lib/people'
import { toast } from '../lib/ui'
import { Sheet } from './Sheet'

/**
 * Margin notes in the reader view: passages other readers noted are highlighted in the article (with
 * the CSS Highlight API, so React's DOM is never touched), listed under it, and selecting a passage
 * offers to note it yourself.
 */
export function MarginNotes({ url, container, html }: { url: string; container: React.RefObject<HTMLDivElement | null>; html: string }) {
  const { data: notes = [] } = useMarginNotes(url)
  const me = useAtproto((a) => a.did)
  const qc = useQueryClient()
  const [picked, setPicked] = useState<string>()
  const [writing, setWriting] = useState<string>()
  const now = Date.now()

  // Highlight every noted passage that's in the text.
  useEffect(() => {
    const el = container.current
    if (!el || !('highlights' in CSS) || typeof Highlight === 'undefined') return
    const ranges = notes.flatMap((n) => findQuote(el, n.quote) ?? [])
    if (ranges.length) CSS.highlights.set('pw-notes', new Highlight(...ranges))
    else CSS.highlights.delete('pw-notes')
    return () => void CSS.highlights.delete('pw-notes')
  }, [notes, html, container])

  // Selecting a passage in the article offers to note it. A tap elsewhere can clear the selection
  // just before the button's own tap lands, so the offer lingers a moment.
  const hide = useRef<number>(undefined)
  useEffect(() => {
    if (!me) return
    const onChange = () => {
      const sel = document.getSelection()
      const el = container.current
      const text = sel && !sel.isCollapsed ? tidy(sel.toString()) : ''
      if (el && sel?.anchorNode && el.contains(sel.anchorNode) && text.length >= 3 && text.length <= 600) {
        window.clearTimeout(hide.current)
        setPicked(text)
      } else {
        window.clearTimeout(hide.current)
        hide.current = window.setTimeout(() => setPicked(undefined), 600)
      }
    }
    document.addEventListener('selectionchange', onChange)
    return () => {
      document.removeEventListener('selectionchange', onChange)
      window.clearTimeout(hide.current)
    }
  }, [me, container])

  const jump = (quote: string) => {
    const el = container.current
    const range = el && findQuote(el, quote)
    range?.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <>
      {notes.length > 0 && (
        <section className="mt-12 border-t border-line pt-6">
          <h3 className="flex items-center gap-2 text-[1rem] font-bold">
            <Highlighter size={16} /> Margin notes · {notes.length}
          </h3>
          <ul className="mt-3 space-y-4">
            {notes.map((n) => (
              <li key={n.uri} className="text-[0.9375rem]">
                <button className="block w-full border-l-2 border-signal pl-3 text-left text-[0.875rem] italic leading-snug text-ink-3 hover:text-ink-2" onClick={() => jump(n.quote)}>
                  <span className="line-clamp-3">“{n.quote}”</span>
                </button>
                <p className="mt-1.5 leading-relaxed text-ink">{n.note}</p>
                <p className="mt-1 flex items-center gap-2 text-[0.8125rem] text-ink-3">
                  {n.handle ? (
                    <Link to={profilePath(n.handle)} className="font-semibold text-ink-2 hover:text-ink">
                      @{n.handle}
                    </Link>
                  ) : (
                    'Someone'
                  )}
                  <span>{timeAgo(Date.parse(n.createdAt), now)} ago</span>
                  {n.did === me && (
                    <button
                      className="ml-auto inline-flex items-center gap-1 hover:text-ink"
                      onClick={() =>
                        void removeNote(qc, url, n.uri).then(
                          () => toast('Note removed'),
                          (err: Error) => toast(err.message, { tone: 'error' }),
                        )
                      }
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {picked &&
        !writing &&
        createPortal(
          <button
            className="note-offer"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              setWriting(picked)
              document.getSelection()?.removeAllRanges()
            }}
          >
            <Highlighter size={15} /> Note this passage
          </button>,
          document.body,
        )}
      {writing && createPortal(<NoteSheet url={url} quote={writing} onClose={() => setWriting(undefined)} />, document.body)}
    </>
  )
}

function NoteSheet({ url, quote, onClose }: { url: string; quote: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const uri = await addNote(qc, url, quote, note)
      onClose()
      toast('Note added', { action: { label: 'Undo', run: () => void removeNote(qc, url, uri).catch(() => {}) } })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Couldn’t save the note', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open onClose={onClose} side="bottom" label="Margin note">
      <form
        className="space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (note.trim()) void save()
        }}
      >
        <h2 className="flex items-center gap-2 text-[1.0625rem] font-bold">
          <Highlighter size={17} /> Margin note
        </h2>
        <p className="border-l-2 border-signal pl-3 text-[0.875rem] italic leading-snug text-ink-3">
          <span className="line-clamp-4">“{quote}”</span>
        </p>
        <textarea
          className="input min-h-24 resize-y py-2.5 leading-relaxed"
          placeholder="What do you make of it?"
          value={note}
          maxLength={1000}
          autoFocus
          onChange={(e) => setNote(e.target.value)}
          aria-label="Your note"
        />
        <p className="text-[0.8125rem] text-ink-3">Public: anyone reading this article on PaperWing sees it, with your handle. It’s kept in your own Bluesky account, not posted to Bluesky.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !note.trim()}>
            {busy ? <Loader2 size={15} className="spin" /> : <Highlighter size={15} />} Add note
          </button>
        </div>
      </form>
    </Sheet>
  )
}
