// Opening a story: it counts once it has been open a moment, so skimming past it with the keys
// on the way to another doesn't.
//
// Staying with a story: 45 seconds with it in sight, counted in 5-second steps so time with the page
// hidden doesn't count. Returns how to stop watching (moving on to another story, closing it).

/** How long in sight counts as staying with a story, and how often that's checked. */
export const LINGER = 45_000
const TICK = 5_000

export function watchLinger(onLinger: () => void, inSight: () => boolean = () => document.visibilityState === 'visible'): () => void {
  let seen = 0
  const tick = setInterval(() => {
    if (!inSight()) return
    seen += TICK
    if (seen < LINGER) return
    clearInterval(tick)
    onLinger()
  }, TICK)
  return () => clearInterval(tick)
}

/** How long a story has to be open to count as opened. */
export const OPENED = 2_000

export function watchOpen(onOpen: () => void): () => void {
  const timer = setTimeout(onOpen, OPENED)
  return () => clearTimeout(timer)
}
