import { Loader2, Send } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { LIMITS, send, useComposer, type ComposeTarget } from '../lib/compose'
import { graphemes } from '../lib/facets'
import { toast } from '../lib/ui'
import { Sheet } from './Sheet'
import { ShareLinks } from './ShareLinks'
import { PostLink } from './PostLink'
import { ShareSheet } from './ShareSheet'

// Writing a post brings a markdown editor (marked, DOMPurify): loaded when it opens, not with the app.
const WritePost = lazy(() => import('./WritePost').then((m) => ({ default: m.WritePost })))

const TITLES: Record<ComposeTarget['kind'], string> = {
  'bsky-reply': 'Reply on Bluesky',
  share: 'Share',
  'post-link': 'Post a link',
  'self-post': 'Write a post',
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
  // Set the moment a send starts, before React re-renders: a second Cmd+Enter mid-send must not post twice.
  const sending = useRef(false)
  useEffect(() => {
    setText('')
    if (target) setTimeout(() => box.current?.focus(), 60)
  }, [target])

  if (!target) return null
  if (target.kind === 'share') return <ShareSheet story={target.story} board={target.board} onClose={close} />
  if (target.kind === 'post-link') return <PostLink url={target.url} title={target.title} board={target.board} onClose={close} />
  if (target.kind === 'self-post')
    return (
      <Suspense fallback={null}>
        <WritePost board={target.board} edit={target.edit} onClose={close} />
      </Suspense>
    )
  if (target.kind === 'links') return <ShareLinks story={target.story} onClose={close} />
  const limit = LIMITS[target.kind]
  const used = graphemes(text)
  const to = target.to
  const submit = async () => {
    // The same conditions that disable the Post button, plus one send at a time.
    if (sending.current || !text.trim() || used > limit) return
    sending.current = true
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
      sending.current = false
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
          onKeyDown={(e) => {
            if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter' || e.repeat) return
            e.preventDefault()
            void submit()
          }}
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
