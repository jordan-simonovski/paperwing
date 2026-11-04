import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPullToRefresh, PULL_THRESHOLD, type PullPhase } from '../lib/pullToRefresh'
import { useOnline } from '../lib/hooks'
import { Pip } from './Pip'

const labels: Record<PullPhase, string> = {
  idle: '',
  pulling: 'Pull to wake Pip',
  armed: 'Release to refresh',
  refreshing: 'Fetching fresh stories…',
}

/** The scene is also used on its own in stories, with no gesture or network required. */
export function PullToRefreshScene({ phase, motion = true }: { phase: PullPhase; motion?: boolean }) {
  return (
    <div className="ptr-scene" data-phase={phase} data-motion={motion}>
      <div className="ptr-stage" aria-hidden="true">
        <span className="ptr-trail" />
        <Pip className="ptr-pip" />
        <span className="ptr-shadow" />
      </div>
      <span className="ptr-label">{labels[phase]}</span>
    </div>
  )
}

/** Mobile feeds scroll the window. Keep the scene open until every source has settled. */
export function PullToRefresh({ onRefresh, enabled, motion }: { onRefresh: () => Promise<unknown>; enabled: boolean; motion: boolean }) {
  const online = useOnline()
  const active = enabled && online
  const indicator = useRef<HTMLDivElement>(null)
  const latest = useRef(onRefresh)
  latest.current = onRefresh
  const [phase, setPhase] = useState<PullPhase>('idle')

  useEffect(() => {
    setPhase('idle')
    const el = indicator.current
    const list = el?.closest('#list-scroll')
    if (!el || !list || !active) return
    const media = window.matchMedia('(pointer: coarse) and (max-width: 899px)')
    const gesture = createPullToRefresh(
      () => latest.current(),
      (next, distance) => {
        el.style.setProperty('--pull-distance', `${distance}px`)
        el.style.setProperty('--pull', String(Math.min(1, distance / PULL_THRESHOLD)))
        el.dataset.dragging = String(next === 'pulling' || next === 'armed')
        setPhase(next)
      },
    )
    const cancel = () => gesture.cancel()
    const start = (event: Event) => {
      const e = event as TouchEvent
      if (!media.matches || window.scrollY > 0 || e.touches.length !== 1) return cancel()
      // A sheet or nested scrolling control owns its own gestures.
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest('[role="dialog"], input, textarea, select, [contenteditable="true"]')) return cancel()
      for (let node = target; node && node !== list; node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)) return cancel()
      }
      gesture.start(e.touches[0].clientX, e.touches[0].clientY)
    }
    const move = (event: Event) => {
      const e = event as TouchEvent
      if (!media.matches || window.scrollY > 0 || e.touches.length !== 1) return cancel()
      if (gesture.move(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault()
    }
    const end = () => void gesture.end()
    list.addEventListener('touchstart', start, { passive: true })
    list.addEventListener('touchmove', move, { passive: false })
    list.addEventListener('touchend', end)
    list.addEventListener('touchcancel', cancel)
    media.addEventListener('change', cancel)
    return () => {
      gesture.dispose()
      list.removeEventListener('touchstart', start)
      list.removeEventListener('touchmove', move)
      list.removeEventListener('touchend', end)
      list.removeEventListener('touchcancel', cancel)
      media.removeEventListener('change', cancel)
      el.style.removeProperty('--pull-distance')
      el.style.removeProperty('--pull')
    }
  }, [active])

  return (
    <>
      <div ref={indicator} className="ptr" aria-hidden="true" hidden={!active} style={{ '--pull-distance': '0px' } as CSSProperties}>
        <PullToRefreshScene phase={phase} motion={motion} />
      </div>
      <span className="sr-only" role="status">
        {active && phase === 'refreshing' ? 'Refreshing feed' : ''}
      </span>
    </>
  )
}
