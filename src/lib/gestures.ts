import { useEffect, useRef } from 'react'

const coarse = () => window.matchMedia('(pointer: coarse)').matches
/** The strip along each side that belongs to back and forward swipes, ours or the system's. */
const EDGE = 28

/**
 * iPhone and iPad give web apps (home screen ones too) their own edge swipe through history,
 * sliding in a snapshot of the page before. Running ours at the same time slid the reader inside
 * the page as the system slid the page, so the list showed twice, and both could go back.
 */
export const systemSwipesBack = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/**
 * Horizontal swipe on an element with actions past a threshold. Writes transform and a
 * data-swipe attribute directly so dragging never re-renders React.
 */
export function useSwipeActions<T extends HTMLElement>(actions: { right?: () => void; left?: () => void }, threshold = 88) {
  const ref = useRef<T>(null)
  const latest = useRef(actions)
  latest.current = actions

  useEffect(() => {
    const el = ref.current
    if (!el || !coarse()) return
    let x0 = 0
    let y0 = 0
    let dx = 0
    let mode: 'idle' | 'pending' | 'swipe' | 'scroll' = 'idle'
    const target = el.firstElementChild as HTMLElement | null

    const reset = () => {
      if (target) {
        target.style.transition = 'transform 180ms ease-out'
        target.style.transform = ''
      }
      delete el.dataset.swipe
      delete el.dataset.armed
    }
    const start = (e: TouchEvent) => {
      x0 = e.touches[0].clientX
      y0 = e.touches[0].clientY
      dx = 0
      // A swipe from the edge is someone going back, not saving the row under their thumb.
      mode = x0 < EDGE || x0 > window.innerWidth - EDGE ? 'idle' : 'pending'
      if (target) target.style.transition = ''
    }
    // And if a back gesture got there first anyway, the row stays put.
    const cancel = () => {
      if (mode === 'idle') return
      mode = 'idle'
      reset()
    }
    const move = (e: TouchEvent) => {
      if (mode === 'idle' || mode === 'scroll') return
      const mx = e.touches[0].clientX - x0
      const my = e.touches[0].clientY - y0
      if (mode === 'pending') {
        if (Math.abs(my) > 8 && Math.abs(my) > Math.abs(mx)) return void (mode = 'scroll')
        if (Math.abs(mx) < 12) return
        mode = 'swipe'
      }
      dx = mx
      if ((dx > 0 && !latest.current.right) || (dx < 0 && !latest.current.left)) dx = dx / 6
      if (target) target.style.transform = `translateX(${dx}px)`
      el.dataset.swipe = dx > 0 ? 'right' : 'left'
      if (Math.abs(dx) > threshold) el.dataset.armed = ''
      else delete el.dataset.armed
    }
    const end = () => {
      if (mode === 'swipe') {
        // Swallow the click that follows a swipe so the row doesn't also open.
        const swallow = (e: Event) => e.stopPropagation()
        el.addEventListener('click', swallow, { capture: true, once: true })
        setTimeout(() => el.removeEventListener('click', swallow, true), 400)
        if (dx > threshold) latest.current.right?.()
        else if (dx < -threshold) latest.current.left?.()
      }
      mode = 'idle'
      reset()
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    window.addEventListener('popstate', cancel)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
      window.removeEventListener('popstate', cancel)
    }
  }, [threshold])

  return ref
}

/** Drag in from the left edge to close. iOS standalone apps have no system back gesture. */
export function useEdgeSwipeBack<T extends HTMLElement>(onBack: () => void, enabled: boolean) {
  const ref = useRef<T>(null)
  const latest = useRef(onBack)
  latest.current = onBack

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled || !coarse()) return
    let x0 = -1
    let y0 = 0
    let dx = 0
    let active = false
    const start = (e: TouchEvent) => {
      const t = e.touches[0]
      x0 = t.clientX < EDGE ? t.clientX : -1
      y0 = t.clientY
      dx = 0
      active = false
    }
    const move = (e: TouchEvent) => {
      if (x0 < 0) return
      const t = e.touches[0]
      dx = Math.max(0, t.clientX - x0)
      if (!active && Math.abs(t.clientY - y0) > Math.abs(dx)) return void (x0 = -1)
      active = dx > 6
      if (active) {
        el.style.transition = 'none'
        el.style.transform = `translateX(${dx}px)`
      }
    }
    const end = () => {
      if (!active) return
      el.style.transition = ''
      el.style.transform = ''
      if (dx > Math.min(120, window.innerWidth * 0.3)) latest.current()
      x0 = -1
      active = false
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [enabled])

  return ref
}
