import { ArrowRight, ClipboardPaste, Link2, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { linkFrom, useComposer } from '../lib/compose'
import { keys } from '../lib/query'
import { linkKey, storyFromKey } from '../lib/sources'
import { api } from '../lib/sources/http'
import { Sheet } from './Sheet'

/**
 * Post a link: anything worth reading, not only stories PaperWing already found. The link first,
 * with its title read from the page (yours wins once you type one); then the share sheet, which
 * lists it on PaperWing and anywhere else you're signed in.
 */
export function PostLink({ url: given, title: givenTitle, board, onClose }: { url?: string; title?: string; board?: string; onClose: () => void }) {
  const linkId = useId()
  const [input, setInput] = useState(given ?? '')
  const [title, setTitle] = useState(givenTitle ?? '')
  const [edited, setEdited] = useState(!!givenTitle)
  const link = linkFrom(input)
  // Read the page's own title once the link stops changing.
  const [settled, setSettled] = useState(link)
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(link), 350)
    return () => window.clearTimeout(t)
  }, [link])
  const card = useQuery({
    queryKey: keys.card(settled ?? ''),
    enabled: !!settled,
    staleTime: Infinity,
    queryFn: () => api('feed', { src: 'card', url: settled }) as Promise<{ title?: string; description?: string }>,
  })
  // The page's title belongs to the link it was read from: while a new link settles, there is none
  // yet, so a changed link never goes out under the old one's title. Your own title always wins.
  const found = settled === link ? card.data?.title?.trim() : undefined
  const shown = edited ? title : (found ?? '')

  const canPaste = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText
  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim()
      if (text) setInput(text)
    } catch {
      // Refused or empty: the field is still there to paste into by hand.
    }
  }

  const next = () => {
    if (!link || !shown.trim()) return
    const story = { ...storyFromKey(linkKey(link))!, title: shown.trim() }
    useComposer.getState().open({ kind: 'share', story, board })
  }

  return (
    <Sheet open onClose={onClose} side="bottom" label="Post a link">
      <form
        className="space-y-3 p-4"
        // Our own check (linkFrom) accepts "example.com/post"; the browser's url check wouldn't.
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          next()
        }}
      >
        <h2 className="flex items-center gap-2 text-[1.0625rem] font-bold">
          <Link2 size={17} /> Post a link
        </h2>
        <p className="text-[0.875rem] text-ink-3">Anything worth reading, whether or not PaperWing has found it. Next, choose where it goes: PaperWing, a board, or your other networks.</p>
        <div className="space-y-1">
          <label htmlFor={linkId} className="block text-[0.8125rem] font-semibold text-ink-2">
            Link
          </label>
          <div className="flex gap-2">
            <input
              id={linkId}
              className="input min-w-0 flex-1"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={input}
              autoFocus={!given}
              onChange={(e) => setInput(e.target.value)}
              aria-invalid={!!input && !link}
            />
            {/* On a phone the link is on the clipboard already, and long-press paste is fiddly. */}
            {!input && canPaste && (
              <button type="button" className="btn flex-none" onClick={() => void paste()}>
                <ClipboardPaste size={15} /> Paste
              </button>
            )}
          </div>
        </div>
        {input && !link && <p className="text-[0.8125rem] text-signal">That doesn’t look like a web link yet.</p>}
        <label className="block space-y-1">
          <span className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink-2">
            Title {card.isFetching && !edited && <Loader2 size={12} className="spin" aria-label="Reading the page’s title" />}
          </span>
          <input
            className="input"
            value={shown}
            maxLength={300}
            placeholder={link ? (card.isFetching ? 'Reading the page…' : 'What is it?') : 'Paste a link first'}
            onChange={(e) => {
              setTitle(e.target.value)
              setEdited(true)
            }}
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!link || !shown.trim()}>
            Next <ArrowRight size={15} />
          </button>
        </div>
      </form>
    </Sheet>
  )
}
