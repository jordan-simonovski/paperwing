import { engagement } from './rank'
import type { Story } from './types'

// Momentum: how fast a story is gaining right now, from the feeds this device has fetched. Each
// look is timed by when its feed was fetched (a feed restored from the cache keeps its old time, so
// it can't pass for a sudden rush), and measured against a look from roughly the last hour. Nothing
// is stored or sent: it's in memory, and starts over with the page.

/** A gain counts once it spans at least this long: a minute's wobble isn't momentum. */
const SPAN = 15 * 60_000
/** Past this, the earlier look rolls forward, so momentum is the last hour or so, not the day. */
const WINDOW = 60 * 60_000
/** Stories remembered at most, the oldest let go first. */
const KEPT = 3000

interface Look {
  at: number
  e: number
}
/** Each story's earlier look to measure from, and a newer one that becomes it as the window moves. */
const looks = new Map<string, { base: Look; mid?: Look }>()

export const resetMomentum = () => looks.clear()

/** A batch of stories and when it was fetched. */
export interface Fetched {
  stories: Story[]
  at: number
}

/** Each story's gain in Hot's engagement units (Hacker News points) an hour, for the ones that are gaining. */
export function momentumOf(batches: Fetched[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const { stories, at } of batches) {
    for (const s of stories) {
      const now = { at, e: engagement(s) }
      const seen = looks.get(s.key)
      if (!seen) {
        looks.set(s.key, { base: now })
        continue
      }
      if (!seen.mid ? at - seen.base.at >= SPAN : at - seen.mid.at >= SPAN) {
        if (seen.mid && at - seen.base.at > WINDOW) seen.base = seen.mid
        seen.mid = now
      }
      const span = at - seen.base.at
      if (span >= SPAN && now.e > seen.base.e) out[s.key] = (now.e - seen.base.e) / (span / 3_600_000)
    }
  }
  while (looks.size > KEPT) looks.delete(looks.keys().next().value!)
  return out
}
