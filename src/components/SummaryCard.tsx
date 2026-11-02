import { keys } from '../lib/query'
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { compact, timeAgo } from '../lib/format'
import { plainText } from '../lib/html'
import { flowInto, usePretext } from '../lib/pretext'
import { usePrefs } from '../lib/store'
import { fetchThread } from '../lib/sources'
import { buildSummaryRequest, ownKey, requestSummary, summaryStatus, type CommentRef } from '../lib/summary'
import { citedRefs, grownBy, useSummaries, worthUpdating, type CachedSummary } from '../lib/summaryCache'
import type { Story, Thread } from '../lib/types'
import { revealComment } from './CommentTree'
import { lastActor, ReadingAnimation } from './pretext/ReadingAnimation'
import { sourceLabel } from './Source'

/** Jumps to a cited comment: scrolls to it in the open thread, or opens the thread it's in. */
function RefChip({ id, refs, currentKey, onOpen }: { id: string; refs: Map<string, CommentRef>; currentKey: string; onOpen: (key: string) => void }) {
  const ref = refs.get(id)
  if (!ref) return null
  return (
    <button
      className="ref-chip"
      title={ref.threadKey === currentKey ? 'Jump to this comment' : 'Open the thread with this comment'}
      onClick={() => {
        if (ref.threadKey !== currentKey) return onOpen(ref.threadKey)
        // The tree may not have built this comment yet; it will, then scroll to it.
        revealComment(ref.commentId)
      }}
    >
      {ref.author}
    </button>
  )
}

export function SummaryCard({ story, places, onOpen }: { story: Story; places: Story[]; onOpen: (key: string) => void }) {
  const qc = useQueryClient()
  const [available, setAvailable] = useState<boolean>()
  useEffect(() => void summaryStatus().then((s) => setAvailable(s.server || !!ownKey.get())), [])

  const used = places.slice(0, 4)
  const total = used.reduce((n, p) => n + (p.comments ?? 0), 0)
  // The summary this device already has for the story (made here or synced): shown as is, and
  // only redone when the reader asks, so reopening a story never spends tokens.
  const cached = useSummaries((st) => st.items[story.key])
  useEffect(() => void useSummaries.getState().load(story.key), [story.key])
  const summary = useMutation({
    mutationKey: ['summary', story.key],
    mutationFn: async (): Promise<CachedSummary> => {
      const threads = (
        await Promise.all(
          used.map(async (s) => ({
            story: s,
            thread: await qc.fetchQuery<Thread | null>({ queryKey: keys.thread(s.key), queryFn: () => fetchThread(s.key), staleTime: 2 * 60_000 }).catch(() => null),
          })),
        )
      ).filter((t): t is { story: Story; thread: Thread } => !!t.thread?.comments.length)
      const { request, refs } = buildSummaryRequest(story, threads)
      const { summary: made, model } = await requestSummary(request)
      const now = Date.now()
      const entry: CachedSummary = {
        key: story.key,
        summary: made,
        model,
        refs: citedRefs(made, refs),
        sent: request.threads.reduce((n, t) => n + t.comments.length, 0),
        total: request.threads.reduce((n, t) => n + t.total, 0),
        comments: total,
        places: threads.map((t) => sourceLabel(t.story)),
        at: now,
        updatedAt: now,
      }
      await useSummaries.getState().put(entry)
      return entry
    },
  })
  const data = cached ?? undefined
  // A summary still being made after the reader left the story and came back: wait for it rather
  // than offering to pay for a second one.
  const making = useIsMutating({ mutationKey: ['summary', story.key] }) > 0
  const make = () => !making && summary.mutate()

  // Pretext motion: the discussion's own words flow around whatever reads along with Claude (the
  // mascot, the bouncing logo or the orb: Settings, Discussion summaries), and the summary's opening
  // pours out of it when it arrives.
  const pretext = usePretext()
  const loader = usePrefs((p) => p.summaryLoader)
  const animated = pretext && loader !== 'plain'
  const reading = making
  // The comments as the threads arrive: Summarize can be tapped before they've loaded.
  const [readingText, setReadingText] = useState('')
  useEffect(() => {
    if (!reading || !animated) return
    const read = () => {
      const words: string[] = []
      for (const p of used) {
        const thread = qc.getQueryData<Thread | null>(keys.thread(p.key))
        for (const c of thread?.comments.slice(0, 12) ?? []) words.push(plainText(c.html))
      }
      setReadingText(words.join(' ').slice(0, 2400) || story.title)
    }
    read()
    return qc.getQueryCache().subscribe((e) => e.query.queryKey[0] === 'thread' && e.type === 'updated' && read())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, animated, story.key])
  const gist = useRef<HTMLParagraphElement>(null)
  const card = useRef<HTMLElement>(null)
  const result = data
  useLayoutEffect(() => {
    const from = lastActor
    if (!result || !gist.current || !from || performance.now() - from.at > 1500) return
    const size = parseFloat(getComputedStyle(gist.current).fontSize)
    flowInto({ to: gist.current, from: { x: from.x - 24, y: from.y - 12, w: 48, size: size * 0.6, opacity: 0 }, duration: 900 })
    for (const [i, el] of [...(card.current?.children ?? [])].slice(1).entries()) {
      el.animate(
        [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 420, delay: 380 + i * 90, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
      )
    }
  }, [result])

  if (total < 10 && !data) return null

  if (!data && !making) {
    return (
      <div className="summary-card mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Catch up on the discussion</p>
          <p className="text-[0.875rem] text-ink-3">
            {available === false ? (
              <>
                Summaries need an Anthropic key.{' '}
                <Link to="/settings/summaries" className="underline">
                  Add one in Settings
                </Link>
                .
              </>
            ) : (
              <>
                Claude reads the top of <span className="num">{compact(total)}</span> comments{used.length > 1 ? ` across ${used.length} places` : ''} and pulls out the themes, the arguments and the
                comments worth reading.
              </>
            )}
          </p>
          {summary.isError && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[0.875rem] font-semibold text-signal">
              <AlertTriangle size={14} /> {summary.error.message}
            </p>
          )}
        </div>
        {available !== false && (
          <button className="btn btn-primary flex-none" onClick={make}>
            <Sparkles size={15} /> Summarize
          </button>
        )}
      </div>
    )
  }

  if (!data || making) {
    if (animated)
      return (
        <div className="summary-card mb-4 space-y-2" role="status">
          <p className="text-[0.875rem] font-semibold text-ink-2">
            Claude is reading <span className="num">{compact(total)}</span> comments…
          </p>
          {readingText && <ReadingAnimation text={readingText} kind={loader} />}
        </div>
      )
    return (
      <div className="summary-card mb-4 flex items-center gap-3 text-ink-2">
        <Loader2 size={18} className="spin flex-none" /> Reading <span className="num">{compact(total)}</span> comments…
      </div>
    )
  }

  const { summary: s, refs: refList, sent, places: from } = data
  const grown = grownBy(data, total)
  const refs = new Map(refList)
  const chips = (ids: string[]) => (
    <span className="mt-1 flex flex-wrap gap-1">
      {[...new Set(ids)].slice(0, 6).map((id) => (
        <RefChip key={id} id={id} refs={refs} currentKey={story.key} onOpen={onOpen} />
      ))}
    </span>
  )

  return (
    <section ref={card} className="summary-card mb-4 space-y-4" aria-label="Summary of the discussion">
      <p ref={gist} className="text-[1.0625rem] leading-relaxed">
        {s.gist}
      </p>
      {s.themes.length > 0 && (
        <div>
          <h3 className="label mb-1.5">What people are talking about</h3>
          <ul className="space-y-2.5">
            {s.themes.map((t, i) => (
              <li key={i}>
                <span className="font-semibold">{t.title}.</span> <span className="text-ink-2">{t.summary}</span>
                {chips(t.comments)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {s.disagreements.length > 0 && (
        <div>
          <h3 className="label mb-1.5">Where they disagree</h3>
          <ul className="space-y-3">
            {s.disagreements.map((d, i) => (
              <li key={i}>
                <p className="font-semibold">{d.question}</p>
                <ul className="mt-1 space-y-1.5 border-l-2 border-[var(--line-strong)] pl-3">
                  {d.sides.map((side, j) => (
                    <li key={j} className="text-ink-2">
                      {side.view}
                      {chips(side.comments)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
      {s.standouts.length > 0 && (
        <div>
          <h3 className="label mb-1.5">Worth reading</h3>
          <ul className="space-y-1.5">
            {s.standouts.map((x, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                <RefChip id={x.comment} refs={refs} currentKey={story.key} onOpen={onOpen} />
                <span className="text-ink-2">{x.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {s.contrast && (
        <p className="text-ink-2">
          <span className="font-semibold text-ink">Across places: </span>
          {s.contrast}
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-3 text-[0.8125rem] text-ink-3">
        <span>
          Summarized by Claude {timeAgo(data.at) === 'now' ? 'just now' : `${timeAgo(data.at)} ago`} from {sent < data.total ? `the top ${sent} of ${data.total}` : sent} comments on {from.join(', ')}.
          It can miss things; the comments are below.
        </span>
        {worthUpdating(data, total) ? (
          <button className="inline-flex items-center gap-1 font-semibold text-signal hover:text-ink" onClick={make}>
            <RotateCcw size={12} /> Update with <span className="num">{compact(grown)}</span> new comments
          </button>
        ) : (
          <button className="inline-flex items-center gap-1 font-semibold hover:text-ink" onClick={make}>
            <RotateCcw size={12} /> Redo
          </button>
        )}
      </p>
      {summary.isError && (
        <p className="flex items-center gap-1.5 text-[0.875rem] font-semibold text-signal">
          <AlertTriangle size={14} /> {summary.error.message}
        </p>
      )}
    </section>
  )
}
