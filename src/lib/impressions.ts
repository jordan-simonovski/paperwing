import { useEffect, type RefObject } from 'react'
import { useActivity } from './store'
import type { Story } from './types'

// One observer for every row: a story counts as seen once it's mostly on screen for over a second.
const DWELL = 1200
/** The story each element shows, kept with the look (visits.ts) and, when passed on, taught to the profile. */
const keys = new WeakMap<Element, Story & { topics?: string[] }>()
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

export function useImpression(ref: RefObject<Element | null>, story: Story & { topics?: string[] }, enabled = true) {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled || typeof IntersectionObserver === 'undefined') return
    keys.set(el, story)
    const o = getObserver()
    o.observe(el)
    return () => {
      o.unobserve(el)
      window.clearTimeout(timers.get(el))
      timers.delete(el)
    }
    // A refetch hands the row a new story object: keep its timer, just look at the newer story.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, story.key, enabled])
  useEffect(() => {
    const el = ref.current
    if (el && keys.has(el)) keys.set(el, story)
  }, [ref, story])
}
