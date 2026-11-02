import { createStore, del, entries, get, set } from 'idb-keyval'
import { create } from 'zustand'
import type { CommentRef } from './summary'
import type { DiscussionSummary } from './summaryTypes'

// Every discussion summary this reader has had, kept on the device per story, so reopening a story
// shows its summary straight away and never asks Claude again on its own. A summary is only
// redone when the reader taps Update (offered once the discussion has grown) or Redo. Summaries
// sync between devices as sealed records (sync.ts), so one made on the desktop is on the phone too.

export interface CachedSummary {
  /** The story the summary is filed under. */
  key: string
  summary: DiscussionSummary
  model: string
  /** Only the refs the summary cites, mapped back to their comments. */
  refs: [string, CommentRef][]
  /** Comments sent to Claude, and how many the threads had in all. */
  sent: number
  total: number
  /** The places' own comment counts when it was made: what "new comments since" counts from. */
  comments: number
  places: string[]
  at: number
  updatedAt: number
}

// Opened on first use, so the pure helpers below load without IndexedDB (in tests).
let opened: ReturnType<typeof createStore> | undefined
const db = () => (opened ??= createStore('readout-summaries', 'items'))
/** Kept this long after it was made; older ones are dropped at startup. */
const KEEP = 60 * 86_400_000

/** New comments since a summary that make it worth offering an update. */
export const grownBy = (s: Pick<CachedSummary, 'comments'>, now: number) => now - s.comments
export const worthUpdating = (s: Pick<CachedSummary, 'comments'>, now: number) => grownBy(s, now) >= Math.max(15, s.comments * 0.25)

/** Keeps only the refs the summary cites: the rest are dead weight once it's made. */
export function citedRefs(summary: DiscussionSummary, refs: Map<string, CommentRef>): [string, CommentRef][] {
  const ids = new Set([...summary.themes.flatMap((t) => t.comments), ...summary.disagreements.flatMap((d) => d.sides.flatMap((s) => s.comments)), ...summary.standouts.map((s) => s.comment)])
  return [...ids].flatMap((id) => {
    const ref = refs.get(id)
    return ref ? [[id, ref] as [string, CommentRef]] : []
  })
}

/** A synced record's summary, if it's the right shape for the story it's filed under. */
export function cleanSummary(key: string, data: unknown): CachedSummary | undefined {
  const d = data as Partial<CachedSummary> | undefined
  if (!d || d.key !== key || typeof d.at !== 'number' || typeof d.updatedAt !== 'number' || typeof d.summary?.gist !== 'string' || !Array.isArray(d.refs)) return undefined
  const s = d.summary
  if (!Array.isArray(s.themes) || !Array.isArray(s.disagreements) || !Array.isArray(s.standouts)) return undefined
  return {
    key,
    summary: s,
    model: String(d.model ?? ''),
    refs: d.refs.filter((r): r is [string, CommentRef] => Array.isArray(r) && typeof r[0] === 'string' && typeof r[1]?.threadKey === 'string' && typeof r[1]?.commentId === 'string'),
    sent: Number(d.sent) || 0,
    total: Number(d.total) || 0,
    comments: Number(d.comments) || 0,
    places: Array.isArray(d.places) ? d.places.map(String) : [],
    at: d.at,
    updatedAt: d.updatedAt,
  }
}

interface SummaryState {
  /** Loaded summaries by story key; null once a story's been looked up and has none. */
  items: Record<string, CachedSummary | null>
  /** Bumped whenever a summary is stored, so sync knows to run. */
  rev: number
  load: (key: string) => Promise<void>
  put: (s: CachedSummary) => Promise<void>
  /** A synced summary: kept if it's newer than this device's. */
  applyRemote: (list: CachedSummary[]) => Promise<void>
  /** Every summary changed after `since`, for sync. */
  changedSince: (since: number) => Promise<CachedSummary[]>
}

export const useSummaries = create<SummaryState>()((setState, getState) => ({
  items: {},
  rev: 0,
  load: async (key) => {
    if (key in getState().items) return
    const s = await get<CachedSummary>(key, db()).catch(() => undefined)
    setState((st) => ({ items: { ...st.items, [key]: s ?? null } }))
  },
  put: async (s) => {
    setState((st) => ({ items: { ...st.items, [s.key]: s }, rev: st.rev + 1 }))
    await set(s.key, s, db()).catch(() => {})
  },
  applyRemote: async (list) => {
    for (const s of list) {
      if (Date.now() - s.at > KEEP) continue
      const mine = getState().items[s.key] ?? (await get<CachedSummary>(s.key, db()).catch(() => undefined))
      if (mine && mine.updatedAt >= s.updatedAt) continue
      await getState().put(s)
    }
  },
  changedSince: async (since) => {
    const all = await entries<string, CachedSummary>(db()).catch(() => [])
    return all.map(([, s]) => s).filter((s) => s.updatedAt > since && Date.now() - s.at < KEEP)
  },
}))

/** Drops summaries past their keep-by date. */
export async function pruneSummaries() {
  const all = await entries<string, CachedSummary>(db()).catch(() => [])
  await Promise.all(all.filter(([, s]) => Date.now() - s.at > KEEP).map(([k]) => del(k, db()).catch(() => {})))
}
