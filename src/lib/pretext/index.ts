import { useEffect, useRef } from 'react'
import { useMediaQuery } from '../hooks'
import { usePrefs } from '../store'
import { settleVisible } from './moves'

export { armHeadline, landHeadline, settleVisible } from './moves'
export { flowInto, pretextOn } from './flow'

/** Whether pretext motion is on here: the setting, unless the system asks for less motion. */
export function usePretext(): boolean {
  const on = usePrefs((p) => p.pretext)
  const calm = useMediaQuery('(prefers-reduced-motion: reduce)')
  return on && !calm
}

/** The first list after launch just appears: the splash was the arrival, and the app is still busy starting. */
let opened = false

/** Typesets a list's headlines in the first time it has stories for each `key` (a page, a feed, a sort). */
export function useTypesetIn(key: string, ready: boolean) {
  const last = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!ready || last.current === key) return
    last.current = key
    if (!opened) return void (opened = true)
    const raf = requestAnimationFrame(() => settleVisible())
    return () => cancelAnimationFrame(raf)
  }, [key, ready])
}
