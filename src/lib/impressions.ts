import { useEffect, type RefObject } from 'react'
import { useActivity } from './store'

// One observer for every row: a story counts as seen once it's mostly on screen for over a second.
const DWELL = 1200
const keys = new WeakMap<Element, string>()
const timers = new Map<Element, number>()
let observer: IntersectionObserver | undefined

function getObserver() {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const key = keys.get(e.target)
        if (!key) continue
        if (e.isIntersecting && !timers.has(e.target)) {
          timers.set(
            e.target,
            window.setTimeout(() => {
              timers.delete(e.target)
              useActivity.getState().noteImpression(key)
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

export function useImpression(ref: RefObject<Element | null>, key: string, enabled = true) {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled || typeof IntersectionObserver === 'undefined') return
    keys.set(el, key)
    const o = getObserver()
    o.observe(el)
    return () => {
      o.unobserve(el)
      window.clearTimeout(timers.get(el))
      timers.delete(el)
    }
  }, [ref, key, enabled])
}
