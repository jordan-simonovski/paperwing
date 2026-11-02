import { Loader2, Send } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { LIMITS, send, useComposer, type ComposeTarget } from '../lib/compose'
import { graphemes } from '../lib/facets'
import { toast } from '../lib/ui'
import { Sheet } from './Sheet'
import { ShareLinks } from './ShareLinks'
import { ShareSheet } from './ShareSheet'

const TITLES: Record<ComposeTarget['kind'], string> = {
  'bsky-reply': 'Reply on Bluesky',
  share: 'Share',
  links: 'Share',
  'fp-comment': 'Comment on Frontpage',
  'hn-reply': 'Reply on Hacker News',
  'lemmy-reply': 'Reply on Lemmy',
}

/** One composer for every place PaperWing writes to: Bluesky replies and posts, Frontpage comments. */
export function Composer() {
  const { target, close } = useComposer()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    setText('')
    if (target) setTimeout(() => box.current?.focus(), 60)
  }, [target])

  if (!target) return null
  if (target.kind === 'share') return <ShareSheet story={target.story} onClose={close} />
  if (target.kind === 'links') return <ShareLinks story={target.story} onClose={close} />
  const limit = LIMITS[target.kind]
  const used = graphemes(text)
  const to = target.to
  const submit = async () => {
    setBusy(true)
    try {
      const where = await send(qc, target, text)
      close()
      toast(
        target.kind === 'fp-comment'
          ? 'Comment posted to Frontpage'
          : target.kind === 'hn-reply'
            ? 'Posted to Hacker News'
            : target.kind === 'lemmy-reply'
              ? 'Posted to Lemmy'
              : target.kind === 'bsky-reply'
                ? 'Reply posted'
                : 'Posted to Bluesky',
        where ? { action: { label: 'View', run: () => window.open(where, '_blank', 'noopener') } } : undefined,
      )
    } catch (err) {
      toast((err as Error).message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={close} side="bottom" label={TITLES[target.kind]}>
      <form
        className="space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="flex items-baseline gap-2">
          <h2 className="text-[1.0625rem] font-bold">{target.kind === 'hn-reply' && target.story ? 'Comment on Hacker News' : TITLES[target.kind]}</h2>
          {to && <span className="truncate text-[0.875rem] text-ink-3">to @{to}</span>}
        </div>
        {target.kind === 'hn-reply' && <p className="text-[0.8125rem] text-ink-3">Plain text: a blank line starts a paragraph, *asterisks* make italics, and lines indented two spaces are code.</p>}
        <textarea
          ref={box}
          className="input min-h-32 resize-y py-3 leading-relaxed"
          style={{ height: 'auto' }}
          placeholder="Write a reply"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && void submit()}
          aria-label="Your post"
        />
        <div className="flex items-center gap-3">
          <span className={`num text-[0.8125rem] ${used > limit ? 'font-semibold text-signal' : 'text-ink-3'}`}>
            {used}/{limit}
          </span>
          <span className="flex-1" />
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !text.trim() || used > limit}>
            {busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />} Post
          </button>
        </div>
      </form>
    </Sheet>
  )
}
