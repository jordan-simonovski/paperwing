import { useEffect, type RefObject } from 'react'
import { useActivity } from './store'

// One observer for every row: a story counts as seen once it's mostly on screen for over a second.
const DWELL = 1200
/** The row each element shows: its key, and its comments now, kept with the look (visits.ts). */
const keys = new WeakMap<Element, { key: string; comments?: number }>()
const timers = new Map<Element, number>()
let observer: IntersectionObserver | undefined

function getObserver() {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const row = keys.get(e.target)
        if (!row) continue
        if (e.isIntersecting && !timers.has(e.target)) {
          timers.set(
            e.target,
            window.setTimeout(() => {
              timers.delete(e.target)
              useActivity.getState().noteImpression(row)
            }, DWELL),
          )
        } else if (!e.isIntersecting) {
          window.clearTimeout(timers.get(e.target))
          timers.delete(e.target)
        }
      }
    },
    { threshold: 0.6 },
  )
  return observer
}

export function useImpression(ref: RefObject<Element | null>, key: string, comments: number | undefined, enabled = true) {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled || typeof IntersectionObserver === 'undefined') return
    keys.set(el, { key, comments })
    const o = getObserver()
    o.observe(el)
    return () => {
      o.unobserve(el)
      window.clearTimeout(timers.get(el))
      timers.delete(el)
    }
  }, [ref, key, comments, enabled])
}
