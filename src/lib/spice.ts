import { create } from 'zustand'
import { spiceMin, type SpiceGrade, type SpiceLevel, type SpiceResponse } from './spiceTypes'
import type { Story } from './types'

// Spice grades for the stories on screen, from /api/spice. Rows ask for their story as they
// render; the asks are batched into one request, and stories the server is still grading are
// asked about again a little later. Grades are shared across readers and cached on the CDN, so
// this is cheap; nothing is stored on the device.

const RETRIES = [12_000, 40_000]

/** Graded sources and their minimum thread size are shared with the server (spiceTypes.ts). */
export const spiceable = (s: Pick<Story, 'key' | 'comments'>) => (s.comments ?? 0) >= (spiceMin(s.key) ?? Infinity)

interface SpiceState {
  enabled?: boolean
  grades: Record<string, SpiceGrade>
}

export const useSpiceStore = create<SpiceState>()(() => ({ grades: {} }))

/** Key → the comment count it was last asked with, so a story isn't asked twice unless it grew. */
const asked = new Map<string, number>()
const queue = new Map<string, number>()
let timer = 0

function flush() {
  timer = 0
  const batch = [...queue].slice(0, 60)
  for (const [k] of batch) queue.delete(k)
  if (queue.size) timer = window.setTimeout(flush, 50)
  if (batch.length) void fetchGrades(batch, 0)
}

/**
 * After a failed ask (the server busy, a moment offline), its stories may be asked about again,
 * after a pause: rows ask on every render, and a server that's struggling shouldn't hear from
 * each one.
 */
function askAgainLater(batch: [string, number][]) {
  window.setTimeout(() => {
    for (const [k, n] of batch) if (asked.get(k) === n) asked.delete(k)
  }, RETRIES[0])
}

async function fetchGrades(batch: [string, number][], attempt: number) {
  try {
    const res = await fetch(`/api/spice?keys=${batch.map(([k, n]) => `${k}~${n}`).join(',')}`)
    if (!res.ok) {
      askAgainLater(batch)
      return
    }
    const data = (await res.json()) as SpiceResponse
    useSpiceStore.setState((s) => ({ enabled: data.enabled, grades: { ...s.grades, ...data.grades } }))
    // Ask again about the ones being graded now (and anything left out this time).
    const again = batch.filter(([k]) => data.pending.includes(k))
    if (again.length && attempt < RETRIES.length) window.setTimeout(() => void fetchGrades(again, attempt + 1), RETRIES[attempt])
  } catch {
    // Offline: rows show no chillies for now.
    askAgainLater(batch)
  }
}

/** Asks for a story's grade if it could have one. Cheap to call on every render. */
export function wantSpice(s: Pick<Story, 'key' | 'source' | 'comments'>) {
  if (useSpiceStore.getState().enabled === false || !spiceable(s)) return
  const n = s.comments ?? 0
  if ((asked.get(s.key) ?? -1) >= n) return
  asked.set(s.key, n)
  queue.set(s.key, n)
  if (!timer) timer = window.setTimeout(flush, 80)
}

/** The hottest grade among a story's places: the row stands for all of them. */
export function useSpice(stories: Pick<Story, 'key' | 'source' | 'comments'>[]): SpiceGrade | undefined {
  return useSpiceStore((st) => {
    let best: SpiceGrade | undefined
    for (const s of stories) {
      const g = st.grades[s.key]
      if (g && (!best || g.level > best.level || (g.level === best.level && g.heat > best.heat))) best = g
    }
    return best
  })
}

/** Hot order, with the most heated discussions first; calm ones keep their place after them. */
export function spicyOrder<T extends Pick<Story, 'key'> & { alsoOn: Pick<Story, 'key'>[] }>(stories: T[], grades: Record<string, SpiceGrade>): T[] {
  const heat = (s: T) => Math.max(0, ...[s, ...s.alsoOn].map((p) => (grades[p.key] ? grades[p.key].level * 10 + grades[p.key].heat : 0)))
  return stories
    .map((s, i) => ({ s, i, h: heat(s) }))
    .sort((a, b) => b.h - a.h || a.i - b.i)
    .map((x) => x.s)
}

const NAMES: Record<SpiceLevel, string> = { 0: 'Calm', 1: 'Lively', 2: 'Heated', 3: 'Flamewar' }

/** "Heated", and what makes it so, in plain words. */
export function describeSpice(g: SpiceGrade): { name: string; reasons: string[] } {
  const reasons = [g.split >= 0.7 && 'split into sides', g.pushback >= 0.5 && 'lots of pushback', g.hostile >= 2 && 'some personal attacks'].filter((r): r is string => !!r)
  return { name: NAMES[g.level], reasons }
}
