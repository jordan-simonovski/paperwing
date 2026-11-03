import { engagement } from './rank'
import type { Story } from './types'

// Momentum: how fast a story is gaining right now, from the feeds this device has fetched. Each story
// is remembered as first seen this sitting; later fetches compare against that. Nothing is stored or
// sent: it's in memory, and starts over with the page.

/** Watched at least this long before its gain counts: a minute's wobble isn't momentum. */
const WATCHED = 15 * 60_000
/** Stories remembered at most, the oldest let go first. */
const KEPT = 3000

const first = new Map<string, { at: number; e: number }>()

export const resetMomentum = () => first.clear()

/** Each story's gain in Hot's engagement units (Hacker News points) an hour, for the ones that are gaining. */
export function momentumOf(stories: Story[], now = Date.now()): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of stories) {
    const e = engagement(s)
    const was = first.get(s.key)
    if (!was) {
      first.set(s.key, { at: now, e })
      continue
    }
    const hours = (now - was.at) / 3_600_000
    if (now - was.at >= WATCHED && e > was.e) out[s.key] = (e - was.e) / hours
  }
  while (first.size > KEPT) first.delete(first.keys().next().value!)
  return out
}
