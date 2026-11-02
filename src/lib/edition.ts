import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Ranked } from './rank'
import type { Story } from './types'

// The daily edition: a short, fixed list picked from your topics since the last one, so there's
// an end to reach. It's a snapshot; it doesn't reshuffle while you read it.

export interface EditionSection {
  /** A followed topic id, or undefined for the "also worth a look" tail. */
  topic?: string
  stories: Story[]
}

export interface Edition {
  /** Local date, YYYY-MM-DD. */
  day: string
  createdAt: number
  /** Stories newer than this were eligible. */
  since: number
  sections: EditionSection[]
  finishedAt?: number
}

export const localDay = (t = Date.now()) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Options {
  followed: string[]
  since: number
  exclude: (key: string) => boolean
  now?: number
  size?: number
  perTopic?: number
}

/**
 * Picks the edition from stories already in hot order: the top couple from each followed topic
 * first, so no single busy topic crowds out the rest, then the best of what's left.
 */
export function buildEdition(stories: Ranked[], { followed, since, exclude, now = Date.now(), size = 15, perTopic = 2 }: Options): EditionSection[] {
  const pick = (from: number) => stories.filter((s) => s.createdAt >= from && !exclude(s.key))
  // A quiet stretch (or a long absence) shouldn't produce a two-story edition.
  let pool = pick(since)
  if (pool.length < size) pool = pick(Math.min(since, now - 72 * 3_600_000))

  const taken = new Set<string>()
  const sections: EditionSection[] = []
  for (const topic of followed) {
    const picks = pool.filter((s) => !taken.has(s.key) && s.topics.includes(topic)).slice(0, perTopic)
    if (!picks.length) continue
    picks.forEach((s) => taken.add(s.key))
    sections.push({ topic, stories: picks })
  }
  const rest = pool.filter((s) => !taken.has(s.key)).slice(0, Math.max(0, size - taken.size))
  if (rest.length) sections.push({ stories: rest })

  // Ranking scores aren't worth storing; where else it's discussed and covered is.
  return sections.map((sec) => ({
    ...sec,
    stories: sec.stories.map((s) => {
      const copy = { ...s } as Partial<Ranked>
      delete copy.heat
      delete copy.topics
      return copy as Story
    }),
  }))
}

interface EditionState {
  current?: Edition
  set: (e: Edition) => void
  finish: () => void
}

export const useEdition = create<EditionState>()(
  persist(
    (set) => ({
      set: (current) => set({ current }),
      finish: () => set((s) => (s.current ? { current: { ...s.current, finishedAt: Date.now() } } : s)),
    }),
    { name: 'readout:edition', version: 1 },
  ),
)
