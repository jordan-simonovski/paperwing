import type { Memory } from './rank'

// Visits: what Hot remembers of you from one sitting to the next, kept on this device. A visit is a
// sitting: the page opening, or coming back to it after half an hour away (the installed app stays
// open all day). Hot sinks what you saw or opened on earlier visits, never on this one, so a row
// doesn't move while it's on screen.

/** How long away starts a new visit. */
export const AWAY = 30 * 60_000

/** One story's latest look: when, its comments then, the visit it was in, and the look before that visit. */
export interface Glimpse {
  at: number
  c?: number
  /** The visit (its start) this look was in. */
  v: number
  pa?: number
  pc?: number
}

let visit = Date.now()
let hiddenAt: number | undefined
const lookedThisVisit = new Set<string>()

export const currentVisit = () => visit

/** For tests: start over, with a visit that began at `at`. */
export function resetVisits(at: number) {
  visit = at
  hiddenAt = undefined
  lookedThisVisit.clear()
}

/** The page went out of sight or came back: back after AWAY or more is a new visit. */
export function noteVisibility(state: 'hidden' | 'visible', now = Date.now()) {
  if (state === 'hidden') hiddenAt ??= now
  else {
    if (hiddenAt !== undefined && now - hiddenAt >= AWAY) resetVisits(now)
    hiddenAt = undefined
  }
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => noteVisibility(document.visibilityState === 'hidden' ? 'hidden' : 'visible'))

/** True the first time a story is on screen this visit: a second scroll past isn't a second look. */
export function firstLookThisVisit(key: string): boolean {
  if (lookedThisVisit.has(key)) return false
  lookedThisVisit.add(key)
  return true
}

/** A story's glimpse after a look now: unchanged within a visit, otherwise this look, keeping the one before. */
export function look(g: Glimpse | undefined, comments: number | undefined, now = Date.now()): Glimpse {
  if (g && g.v === visit) return g
  return { at: now, ...(comments !== undefined ? { c: comments } : {}), v: visit, ...(g ? { pa: g.at, ...(g.c !== undefined ? { pc: g.c } : {}) } : {}) }
}

/**
 * What Hot remembers from earlier visits: how many a story was on screen in, when you last saw it
 * then and its comments at the time, and whether you opened it. Nothing from this visit counts.
 */
export function memoryOf(impressions: Record<string, number>, glimpses: Record<string, Glimpse>, read: Record<string, number>): Record<string, Memory> {
  const out: Record<string, Memory> = {}
  for (const key of new Set([...Object.keys(impressions), ...Object.keys(read)])) {
    const g = glimpses[key]
    const now = g?.v === visit
    const looks = Math.max(0, (impressions[key] ?? 0) - (now ? 1 : 0))
    const openedAt = read[key] !== undefined && read[key] < visit ? read[key] : undefined
    if (!looks && openedAt === undefined) continue
    const at = (now ? g.pa : g?.at) ?? openedAt ?? 0
    const comments = now ? g.pc : g?.c
    out[key] = { looks, at, ...(comments !== undefined ? { comments } : {}), ...(openedAt !== undefined ? { openedAt } : {}) }
  }
  return out
}

/**
 * Looks kept within `cap`, trimmed together to the `keep` most recently seen: a count and its look
 * stay in step, and what's new to the ranking (last visit's looks) is never what goes.
 */
export function capLooks(impressions: Record<string, number>, glimpses: Record<string, Glimpse>, cap: number, keep: number) {
  if (Object.keys(impressions).length <= cap && Object.keys(glimpses).length <= cap) return { impressions, glimpses }
  const recent = [...new Set([...Object.keys(impressions), ...Object.keys(glimpses)])].sort((a, b) => (glimpses[b]?.at ?? -Infinity) - (glimpses[a]?.at ?? -Infinity)).slice(0, keep)
  const pick = <T>(m: Record<string, T>) => Object.fromEntries(recent.filter((k) => k in m).map((k) => [k, m[k]]))
  return { impressions: pick(impressions), glimpses: pick(glimpses) }
}
