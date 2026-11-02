import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fetchThread } from './sources'
import type { Comment, Story } from './types'

// Threads you follow. Each remembers when you last looked, and a check counts the replies
// posted since. Unwatching leaves a dated tombstone, so sync can carry the removal.

export interface Watched {
  story: Story
  addedAt: number
  /** When you last opened the thread. */
  lookedAt: number
  /** Replies newer than lookedAt, as of checkedAt. */
  fresh?: number
  total?: number
  checkedAt?: number
  /** Set when unwatched; the entry stays as a tombstone for sync. */
  removedAt?: number
  updatedAt: number
}

const countSince = (cs: Comment[], since: number): number => cs.reduce((n, c) => n + (c.createdAt > since ? 1 : 0) + countSince(c.children, since), 0)
const countAll = (cs: Comment[]): number => cs.reduce((n, c) => n + 1 + countAll(c.children), 0)

/** Threads go quiet; stop checking a month after the last reply we saw. */
const EXPIRE = 30 * 86_400_000

interface WatchState {
  items: Record<string, Watched>
  watch: (story: Story) => void
  unwatch: (key: string) => void
  /** Call when the thread is open: everything in it is now seen. */
  looked: (key: string, comments?: Comment[]) => void
  check: (opts?: { maxAgeMs?: number }) => Promise<void>
  /** Sync: replace entries that are newer elsewhere. */
  apply: (entries: Watched[]) => void
}

export const isWatching = (w?: Watched) => !!w && !w.removedAt

export const useWatch = create<WatchState>()(
  persist(
    (set, get) => ({
      items: {},
      watch: (story) => {
        const now = Date.now()
        const plain = { ...story } as Record<string, unknown>
        for (const k of ['alsoOn', 'coverage', 'heat', 'topics']) delete plain[k]
        set((s) => ({ items: { ...s.items, [story.key]: { story: plain as unknown as Story, addedAt: now, lookedAt: now, fresh: 0, total: story.comments, updatedAt: now } } }))
      },
      unwatch: (key) =>
        set((s) => {
          const w = s.items[key]
          if (!w) return s
          return { items: { ...s.items, [key]: { ...w, removedAt: Date.now(), updatedAt: Date.now() } } }
        }),
      looked: (key, comments) =>
        set((s) => {
          const w = s.items[key]
          if (!isWatching(w)) return s
          return { items: { ...s.items, [key]: { ...w, lookedAt: Date.now(), fresh: 0, total: comments ? countAll(comments) : w.total, updatedAt: Date.now() } } }
        }),
      check: async ({ maxAgeMs = 10 * 60_000 } = {}) => {
        if (!navigator.onLine) return
        const due = Object.values(get().items).filter((w) => isWatching(w) && Date.now() - (w.checkedAt ?? 0) > maxAgeMs && Date.now() - w.lookedAt < EXPIRE)
        for (let i = 0; i < due.length; i += 3) {
          await Promise.allSettled(
            due.slice(i, i + 3).map(async (w) => {
              const thread = await fetchThread(w.story.key)
              if (!thread) return
              set((s) => {
                const cur = s.items[w.story.key]
                if (!isWatching(cur)) return s
                // Checking isn't an edit, so updatedAt stays put and sync doesn't echo it.
                return { items: { ...s.items, [w.story.key]: { ...cur, fresh: countSince(thread.comments, cur.lookedAt), total: countAll(thread.comments), checkedAt: Date.now() } } }
              })
            }),
          )
        }
      },
      apply: (entries) =>
        set((s) => {
          const items = { ...s.items }
          for (const e of entries) if (!items[e.story.key] || items[e.story.key].updatedAt < e.updatedAt) items[e.story.key] = { ...e, fresh: items[e.story.key]?.fresh, checkedAt: undefined }
          return { items }
        }),
    }),
    {
      name: 'readout:watch',
      version: 1,
      // Tombstones only need to outlive a sync or two.
      merge: (persisted, current) => {
        const p = persisted as Partial<WatchState> | undefined
        const items = Object.fromEntries(Object.entries(p?.items ?? {}).filter(([, w]) => !w.removedAt || Date.now() - w.removedAt < 60 * 86_400_000))
        return { ...current, items }
      },
    },
  ),
)
