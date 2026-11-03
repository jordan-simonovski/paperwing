import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { systemSwipesBack, useEdgeSwipeBack } from '../lib/gestures'
import { useMediaQuery } from '../lib/hooks'
import { navCommitted, navStart } from '../lib/diag'
import { armHeadline, pretextOn } from '../lib/pretext'
import { useActivity } from '../lib/store'
import { firstTime } from '../lib/firsts'
import { keysBelongElsewhere, toast } from '../lib/ui'
import type { Story } from '../lib/types'
import type { PaneTab } from './ItemPane'
import { hideStory, toggleArchived, toggleSaved, toggleWatch } from './StoryRow'

/**
 * Desktop story switches cross-fade the reader with the View Transitions API (styles.css). Phones
 * already slide the reader in, and reduced motion means no animation at all. With pretext motion on,
 * the headline flying into the reader is the transition instead.
 */
const smooth = () => 'startViewTransition' in document && matchMedia('(min-width: 900px) and (prefers-reduced-motion: no-preference)').matches && !pretextOn()

/** Marks a history entry as a story opened from the list, so closing it can step back to that list. */
interface PaneState {
  fromList?: boolean
}

/** Opening/closing items as URL changes, so every pane state is linkable and the back button works. */
export function usePane(base: string) {
  const navigate = useNavigate()
  const location = useLocation()
  // Read the URL through a ref so open/close keep their identity across navigations. Every row
  // receives `open`; a new function on each open or close would re-render the whole list.
  const here = useRef(location)
  here.current = location
  const open = useCallback(
    (key: string, tab?: PaneTab) => {
      const params = new URLSearchParams(here.current.search)
      if (tab) params.set('tab', tab)
      else params.delete('tab')
      const qs = params.toString()
      const alreadyOpen = here.current.pathname.startsWith(`${base}/`)
      // Swapping items inside an open pane replaces history, so Back closes the pane instead of
      // stepping through every story; the entry keeps knowing it sits on top of the list.
      const state: PaneState = { fromList: alreadyOpen ? !!(here.current.state as PaneState | null)?.fromList : true }
      // Pretext motion: the row's headline flies into the reader's.
      armHeadline(key)
      navigate(`${base}/${key}${qs ? `?${qs}` : ''}`, { replace: alreadyOpen, state, viewTransition: smooth() })
    },
    [base, navigate],
  )
  const close = useCallback(() => {
    navStart('Back to the list')
    const fade = smooth()
    // Opened from the list: step back to it rather than pushing the list again, so history doesn't
    // grow two entries per story and the system back button leaves the list instead of reopening
    // the story. (The desktop cross-fade needs a push, which history can afford there.)
    if (!fade && (here.current.state as PaneState | null)?.fromList) return void navigate(-1)
    const params = new URLSearchParams(here.current.search)
    params.delete('tab')
    const qs = params.toString()
    navigate(`${base}${qs ? `?${qs}` : ''}`, { replace: !fade, viewTransition: fade })
  }, [base, navigate])
  return { open, close }
}

// The reading pane (threads, the reader view, summaries, related coverage and everything they need)
// is a separate chunk, so the list doesn't wait on it at launch. It's fetched as soon as the app
// is idle, so the first story opened finds it ready.
const loadPane = () => import('./ItemPane')
const ItemPane = lazy(() => loadPane().then((m) => ({ default: m.ItemPane })))
let preloaded = false
function preloadPane() {
  if (preloaded) return
  preloaded = true
  const go = () => void loadPane()
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 3000 })
  else setTimeout(go, 1500)
}

interface Props {
  base: string
  itemKey?: string
  list: React.ReactNode
  idle?: React.ReactNode
}

export function Split({ base, itemKey, list, idle }: Props) {
  const { open, close } = usePane(base)
  // Where the system swipes back through history (iOS), a story opened from the list leaves that
  // swipe to it; ours covers stories opened from a link, with nothing in history to go back to.
  const fromList = !!(useLocation().state as PaneState | null)?.fromList
  const paneRef = useEdgeSwipeBack<HTMLElement>(close, !!itemKey && !(fromList && systemSwipesBack()))
  // On phones the idle pane is display:none; don't build it at all.
  const wide = useMediaQuery('(min-width: 900px)')
  useLayoutEffect(() => {
    if (!itemKey) navCommitted()
  }, [itemKey])
  useEffect(preloadPane, [])
  return (
    <>
      <div className="list-col scroll-thin" id="list-scroll">
        {list}
      </div>
      <aside ref={paneRef} className={`pane-col ${itemKey ? 'open' : 'idle'}`} aria-label="Reading pane">
        {itemKey ? (
          <Suspense fallback={null}>
            <ItemPane key={itemKey} itemKey={itemKey} onClose={close} onOpen={open} />
          </Suspense>
        ) : wide ? (
          idle
        ) : null}
      </aside>
    </>
  )
}

/**
 * j/k move a cursor through the list. Once a story is open, j/k open the next one directly,
 * the way a mail client works.
 */
export function useListKeys(stories: Story[], itemKey: string | undefined, base: string, onRefresh?: () => void) {
  const { open, close } = usePane(base)
  const [cursor, setCursor] = useState<string | undefined>(itemKey)
  useEffect(() => {
    if (itemKey) setCursor(itemKey)
  }, [itemKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (keysBelongElsewhere(e)) return
      const idx = stories.findIndex((s) => s.key === cursor)
      const current = stories[idx]
      const move = (delta: number) => {
        const next = stories[Math.max(0, Math.min(stories.length - 1, idx + delta))]
        if (!next) return
        setCursor(next.key)
        document.getElementById(`row-${next.key}`)?.scrollIntoView({ block: 'nearest' })
        if (itemKey) open(next.key)
      }
      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          if (e.key === 'ArrowDown' && !itemKey && document.activeElement !== document.body) return
          e.preventDefault()
          move(idx < 0 ? 0 : 1)
          // Someone reading by keyboard: the two keys that open up the rest.
          if (e.key === 'j' && firstTime('keys')) toast('Reading by keyboard: / jumps anywhere, and ? lists every shortcut.')
          break
        case 'k':
        case 'ArrowUp':
          if (e.key === 'ArrowUp' && !itemKey && document.activeElement !== document.body) return
          e.preventDefault()
          move(-1)
          break
        case 'Enter':
        case 'l':
          if (current) open(current.key)
          break
        case 'c':
          if (current) open(current.key, 'discussion')
          break
        case 'a':
          if (current) open(current.key, 'article')
          break
        case 'o':
          if (current) {
            useActivity.getState().markRead(current.key)
            const target = current.url ?? current.discussionUrl ?? ''
            // Story links come from feeds and sync; only ever open web addresses.
            if (/^https?:\/\//i.test(target)) window.open(target, '_blank', 'noopener')
          }
          break
        case 's':
          if (current) void toggleSaved(current)
          break
        case 'u':
        case 'd':
          if (current) useActivity.getState().vote(current, e.key === 'u' ? 1 : -1)
          break
        case 'e':
          if (current) void toggleArchived(current)
          break
        case 'w':
          if (current?.hasThread) toggleWatch(current)
          break
        case 'x':
          if (current) {
            move(1)
            hideStory(current.key, current)
          }
          break
        case 'Escape':
        case 'h':
          if (itemKey) close()
          break
        case 'r':
          onRefresh?.()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stories, cursor, itemKey, open, close, onRefresh])

  return { cursor: cursor ?? itemKey, open }
}
