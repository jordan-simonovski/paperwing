import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ago, compact, fullDate } from '../lib/format'
import { sanitize } from '../lib/html'
import { Covered } from './Covered'
import { MediaGallery } from './Media'
import { QuoteCard } from './QuoteCard'
import type { CommentRules } from '../lib/accounts'
import { useComposer } from '../lib/compose'
import { VoteButton } from './Social'
import { BATCH, pickVisible } from '../lib/threadBudget'
import { usePrefs } from '../lib/store'
import type { Comment } from '../lib/types'

type Sort = 'source' | 'new' | 'old'

interface TreeCtx {
  /** Built comments; anything else shows as "N more replies" under its parent. */
  shown: (id: string) => boolean
  /** Comments whose replies were all asked for. */
  opened: Set<string>
  open: (id: string) => void
  op?: string
  since?: number
  /** Bumped by "collapse all"/"expand all" so every comment can react. */
  command: { gen: number; mode: 'collapse-roots' | 'expand' }
  sourceName: string
  now: number
  /** Reply and like/vote, when signed in to a thread PaperWing can write to (Social.tsx). */
  act?: CommentRules
}
const Ctx = createContext<TreeCtx>({ shown: () => true, opened: new Set(), open: () => {}, command: { gen: 0, mode: 'expand' }, sourceName: '', now: Date.now() })

// Anything outside the tree (summary citations, the minimap, n/p) asks for a comment this way;
// the tree renders far enough to include it, then scrolls to it.
const REVEAL = 'readout:reveal-comment'
export function revealComment(id: string) {
  window.dispatchEvent(new CustomEvent(REVEAL, { detail: id }))
}

const NEXT = 'readout:next-thread'
/** The reader's "Next thread" button: the tree knows whether it has to build more first. */
export function nextThread() {
  window.dispatchEvent(new Event(NEXT))
}

function flash(el: HTMLElement) {
  el.classList.remove('flash')
  void el.offsetWidth
  el.classList.add('flash')
}

interface View {
  sort: Sort
  budget: number
  opened: Set<string>
  forced: Set<string>
}
const initialView = (sort: Sort): View => ({ sort, budget: BATCH, opened: new Set(), forced: new Set() })

/** Replies are scored in each source's own unit. */
const scoreWord = (source: string, n: number) => {
  const [one, many] = source === 'Bluesky' ? ['like', 'likes'] : source === 'Mastodon' ? ['favourite', 'favourites'] : ['point', 'points']
  return n === 1 ? one : many
}

const countAll = (cs: Comment[]): number => cs.reduce((n, c) => n + 1 + countAll(c.children), 0)
const countNew = (cs: Comment[], since: number): number => cs.reduce((n, c) => n + (c.createdAt > since ? 1 : 0) + countNew(c.children, since), 0)

function sortTree(cs: Comment[], sort: Sort): Comment[] {
  if (sort === 'source') return cs
  const sorted = [...cs].sort((a, b) => (sort === 'new' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))
  return sorted.map((c) => ({ ...c, children: sortTree(c.children, sort) }))
}

const CommentNode = memo(function CommentNode({ c, depth }: { c: Comment; depth: number }) {
  const { op, since, command, sourceName, now, shown, opened, open, act } = useContext(Ctx)
  const [collapsed, setCollapsed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const descendants = useMemo(() => countAll(c.children), [c.children])
  const isNew = !!since && c.createdAt > since
  const kids = opened.has(c.id) ? c.children : c.children.filter((k) => shown(k.id))
  const unbuilt = kids.length < c.children.length ? c.children.filter((k) => !kids.includes(k)).reduce((n, k) => n + 1 + countAll(k.children), 0) : 0

  useEffect(() => {
    if (!command.gen) return
    if (command.mode === 'expand') setCollapsed(false)
    else if (depth === 0) setCollapsed(true)
  }, [command, depth])

  const toggle = useCallback(() => {
    setCollapsed((v) => {
      const next = !v
      // Collapsing from deep inside a long thread would leave you somewhere random; snap back to its head.
      if (next && ref.current) {
        const top = ref.current.getBoundingClientRect().top
        if (top < 80) ref.current.scrollIntoView({ block: 'start', behavior: 'smooth' })
      }
      return next
    })
  }, [])

  return (
    <div ref={ref} id={`c-${c.id}`} className={`cmt${depth === 0 ? ' root' : ''}${collapsed ? ' collapsed' : ''}${isNew ? ' new' : ''}`} data-root={depth === 0 || undefined} data-depth={depth % 6}>
      <div className="cmt-body">
        <button className="cmt-rail" aria-label={collapsed ? 'Expand thread' : 'Collapse thread'} aria-expanded={!collapsed} onClick={toggle} />
        <div className="cmt-head" onClick={toggle}>
          <span className={`cmt-author${c.deleted ? ' text-ink-3' : ''}`}>{c.author}</span>
          {op && c.author === op && <span className="op">OP</span>}
          {isNew && <span className="cmt-new">New</span>}
          <span title={fullDate(c.createdAt)}>{ago(c.createdAt, now)}</span>
          {c.score !== undefined && (
            <span className="num">
              {compact(c.score)} {scoreWord(sourceName, c.score)}
            </span>
          )}
          {collapsed && <span className="cmt-more num">{descendants + 1} hidden</span>}
        </div>
        {!collapsed && (
          <>
            <Covered warning={c.folded} className="my-1">
              {c.deleted && !c.html ? (
                <p className="py-1 text-[0.875rem] text-ink-3">This comment was deleted.</p>
              ) : (
                <div className="prose-c mt-1" dangerouslySetInnerHTML={{ __html: sanitize(c.html) }} />
              )}
              {c.media && (
                <div className="mb-2 mt-2">
                  <MediaGallery media={c.media} href={c.url} compact />
                </div>
              )}
            </Covered>
            {c.quote && (
              <div className="mb-2 mt-2">
                <QuoteCard quote={c.quote} />
              </div>
            )}
            {act && (act.canReply(c) || act.canVote(c)) && <CommentActs c={c} act={act} />}
            {c.more ? (
              <a
                className="mb-1 inline-block text-[0.8125rem] font-semibold text-ink-2 underline decoration-signal decoration-2 underline-offset-4 hover:text-ink"
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {c.more} more {c.more === 1 ? 'reply' : 'replies'} on {sourceName}
              </a>
            ) : null}
          </>
        )}
      </div>
      {!collapsed && kids.map((child) => <CommentNode key={child.id} c={child} depth={depth + 1} />)}
      {!collapsed && unbuilt > 0 && (
        <button className="cmt-expand" onClick={() => open(c.id)}>
          {unbuilt} more {unbuilt === 1 ? 'reply' : 'replies'}
        </button>
      )}
    </div>
  )
})

interface Props {
  comments: Comment[]
  op?: string
  since?: number
  sourceName: string
  scrollRef: React.RefObject<HTMLDivElement | null>
  now: number
  /** Reply and like/vote buttons on each comment (Social.tsx). */
  actions?: CommentRules
}

export function CommentTree({ comments, op, since, sourceName, scrollRef, now, actions }: Props) {
  const [sort, setSort] = useState<Sort>('source')
  const colours = usePrefs((p) => p.threadColours)
  const [command, setCommand] = useState<TreeCtx['command']>({ gen: 0, mode: 'expand' })
  const sorted = useMemo(() => sortTree(comments, sort), [comments, sort])
  // What's built: a growing budget, replies opened by hand, and comments revealed on request.
  // All of it resets when the order changes.
  const [view, setView] = useState(() => initialView(sort))
  const current = useMemo(() => (view.sort === sort ? view : initialView(sort)), [view, sort])
  const visible = useMemo(() => pickVisible(sorted, current.budget), [sorted, current.budget])
  const shown = useCallback((id: string) => visible.has(id) || current.forced.has(id), [visible, current.forced])
  const update = useCallback((fn: (v: View) => View) => setView((v) => fn(v.sort === sort ? v : initialView(sort))), [sort])
  const more = useCallback(() => update((v) => ({ ...v, budget: v.budget + BATCH })), [update])
  const open = useCallback((id: string) => update((v) => ({ ...v, opened: new Set(v.opened).add(id) })), [update])
  const parentOf = useMemo(() => {
    const map = new Map<string, string>()
    const walk = (cs: Comment[], parent?: string) => {
      for (const c of cs) {
        if (parent) map.set(c.id, parent)
        walk(c.children, c.id)
      }
    }
    walk(sorted)
    return map
  }, [sorted])
  const [pending, setPending] = useState<string>()
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onReveal = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      if (!parentOf.has(id) && !sorted.some((c) => c.id === id)) return
      // Build the comment and the replies above it, nothing else.
      if (!shown(id))
        update((v) => {
          const forced = new Set(v.forced)
          for (let at: string | undefined = id; at; at = parentOf.get(at)) forced.add(at)
          return { ...v, forced }
        })
      setPending(id)
    }
    window.addEventListener(REVEAL, onReveal)
    return () => window.removeEventListener(REVEAL, onReveal)
  }, [parentOf, sorted, shown, update])

  // Once a requested comment exists, bring it into view.
  useEffect(() => {
    if (!pending) return
    const el = document.getElementById(`c-${pending}`)
    if (!el) return
    setPending(undefined)
    // Gliding across thousands of pixels of replies just to land somewhere is worse than a cut.
    const far = Math.abs(el.getBoundingClientRect().top) > window.innerHeight * 3
    el.scrollIntoView({ block: 'center', behavior: far ? 'instant' : 'smooth' })
    // Comments never rendered are placeholders until scrolled past, so a long jump lands short.
    // Re-centre for a few frames while they take their real size.
    if (far) {
      let frames = 6
      const settle = () => {
        el.scrollIntoView({ block: 'center', behavior: 'instant' })
        if (--frames) requestAnimationFrame(settle)
      }
      requestAnimationFrame(settle)
    }
    flash(el)
  }, [pending, view])

  const total = useMemo(() => countAll(comments), [comments])
  const remaining = total - visible.size
  // Build the next slice before the reader reaches the end of this one.
  useEffect(() => {
    const el = sentinel.current
    if (!el || remaining <= 0 || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && more(), { root: scrollRef.current, rootMargin: '0px 0px 1500px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [remaining, more, scrollRef])
  const fresh = useMemo(() => (since ? countNew(comments, since) : 0), [comments, since])
  const ctx = useMemo(() => ({ op, since, command, sourceName, now, shown, opened: current.opened, open, act: actions }), [op, since, command, sourceName, now, shown, current.opened, open, actions])

  const jump = useCallback(
    (dir: 1 | -1) => {
      // Past the last built comment, build the next one and go there.
      if (jumpToRoot(scrollRef.current, dir) || dir !== 1) return
      const next = sorted.find((c) => !shown(c.id))
      if (next) revealComment(next.id)
    },
    [scrollRef, sorted, shown],
  )

  useEffect(() => {
    const onNext = () => jump(1)
    window.addEventListener(NEXT, onNext)
    return () => window.removeEventListener(NEXT, onNext)
  }, [jump])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'n') jump(1)
      else if (e.key === 'p') jump(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jump])

  if (!comments.length) return <p className="py-12 text-center text-ink-3">No comments yet. The thread is open on the source if you want to start it.</p>

  return (
    <Ctx.Provider value={ctx}>
      <div className="sticky top-0 z-[5] -mx-5 flex items-center gap-2 bg-panel px-5 py-2.5 md:-mx-10 md:px-10">
        <span className="text-[0.875rem] text-ink-2">
          {/* A status page incident's thread is its updates. */}
          <span className="num font-semibold text-ink">{total}</span> {sourceName === 'Status pages' ? (total === 1 ? 'update' : 'updates') : 'comments'}
          {fresh > 0 && (
            <span className="ml-2 font-semibold text-signal">
              <span className="num">{fresh}</span> new since your last visit
            </span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <select className="h-8 rounded-full bg-sunk px-3 text-[0.8125rem] font-semibold text-ink-2" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort comments">
            <option value="source">Top</option>
            <option value="new">Newest</option>
            <option value="old">Oldest</option>
          </select>
          <button className="icon-btn" title="Collapse all threads" onClick={() => setCommand((c) => ({ gen: c.gen + 1, mode: 'collapse-roots' }))}>
            <ChevronsDownUp size={15} />
          </button>
          <button className="icon-btn" title="Expand all" onClick={() => setCommand((c) => ({ gen: c.gen + 1, mode: 'expand' }))}>
            <ChevronsUpDown size={15} />
          </button>
        </div>
      </div>
      <div className="thread pb-24" data-rails={colours ? 'colour' : undefined}>
        {sorted
          .filter((c) => shown(c.id))
          .map((c) => (
            <CommentNode key={c.id} c={c} depth={0} />
          ))}
        {remaining > 0 && (
          <div ref={sentinel} className="py-6 text-center">
            <button className="btn" onClick={more}>
              Show more comments <span className="num font-normal text-ink-3">{remaining}</span>
            </button>
          </div>
        )}
      </div>
    </Ctx.Provider>
  )
}

/** Scrolls to the next (or previous) top-level comment below the sticky toolbar. False if there isn't one built. */
export function jumpToRoot(container: HTMLElement | null, dir: 1 | -1): boolean {
  if (!container) return false
  const roots = [...container.querySelectorAll<HTMLElement>('[data-root]')]
  const offset = container.getBoundingClientRect().top + 56
  const target = dir === 1 ? roots.find((r) => r.getBoundingClientRect().top > offset + 4) : [...roots].reverse().find((r) => r.getBoundingClientRect().top < offset - 4)
  if (!target) return false
  container.scrollTo({ top: container.scrollTop + target.getBoundingClientRect().top - offset + 8, behavior: 'smooth' })
  flash(target)
  return true
}

/** Thread minimap: one segment per top-level comment, sized by its subtree. */
export function Spine({ comments, since, scrollRef }: { comments: Comment[]; since?: number; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const sizes = useMemo(() => comments.map((c) => ({ id: c.id, author: c.author, size: 1 + countAll(c.children), fresh: since ? countNew([c], since) : 0 })), [comments, since])
  if (sizes.length < 4) return null
  return (
    <nav className="spine h-full py-3" aria-label="Thread map">
      {sizes.map((s) => (
        <button
          key={s.id}
          style={{ flexGrow: Math.sqrt(s.size) }}
          className={s.fresh ? 'fresh' : undefined}
          title={`${s.author}, ${s.size} ${s.size === 1 ? 'comment' : 'comments'}${s.fresh ? `, ${s.fresh} new` : ''}`}
          onClick={() => {
            const el = scrollRef.current?.querySelector<HTMLElement>(`#c-${CSS.escape(s.id)}`)
            if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' })
            else revealComment(s.id)
          }}
        />
      ))}
    </nav>
  )
}

/** Reply and vote under a comment, where the reader can. */
function CommentActs({ c, act }: { c: Comment; act: CommentRules }) {
  const open = useComposer((s) => s.open)
  const reply = act.reply(c)
  const vote = act.vote(c)
  return (
    <div className="cmt-acts">
      {reply && (
        <button className="cmt-act" onClick={() => open(reply)}>
          Reply
        </button>
      )}
      {vote && <VoteButton target={vote} small />}
    </div>
  )
}
