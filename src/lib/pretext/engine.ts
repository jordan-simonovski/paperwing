import { usePrefs } from '../store'

// Pretext is about 40 kB, so it isn't in the main bundle: it loads when the browser is idle, and
// only if pretext motion is on. Until it arrives, animations simply don't run.

type Pretext = typeof import('@chenglou/pretext')
let mod: Pretext | undefined
let loading: Promise<Pretext> | undefined

export const loadPretext = () => (loading ??= import('@chenglou/pretext').then((m) => (mod = m)))
/** Pretext if it's loaded already. */
export const pretextNow = () => mod

/** At startup: fetch pretext in the background when motion is on, now or once it's switched on. */
export function preloadPretext() {
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500))
  if (usePrefs.getState().pretext) idle(() => void loadPretext())
  usePrefs.subscribe((s, prev) => s.pretext && !prev.pretext && void loadPretext())
}
