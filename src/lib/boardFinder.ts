import { matchesTopic, type Topic } from './topics.js'

// Finding community boards: by name, by topic, and by how lively they are. Pure, so the command
// bar, Search, Explore and topic pages all find the same boards the same way.

/**
 * Who runs PaperWing's own boards: the accounts the deployment names in PAPERWING_OFFICIAL (DIDs,
 * separated by commas or spaces), read by the server. A board is official when one of them owns
 * it. Who owns a board is part of its address, so no name or description can claim it.
 */
export const officialFrom = (setting: string) => {
  const dids = new Set(setting.split(/[\s,]+/).filter((s) => s.startsWith('did:')))
  return (did: string) => dids.has(did)
}

/** What a board finder needs to know about one. */
export interface FindableBoard {
  name: string
  description?: string
  topic?: string
  createdAt: string
  /** Listings in the last week. */
  active?: number
  official?: boolean
}

const B32 = '234567abcdefghijklmnopqrstuvwxyz'
/** When an atproto record key (a TID) was made, in ms, or undefined when the key isn't one. */
export function tidTime(rkey: string): number | undefined {
  if (!/^[2-7a-j][2-7a-z]{12}$/.test(rkey)) return undefined
  let n = 0n
  for (const c of rkey) n = (n << 5n) | BigInt(B32.indexOf(c))
  return Number((n >> 10n) / 1000n)
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/** Boards whose name (first) or description has every word of the query (as the start of a word). */
export function findBoards<T extends FindableBoard>(boards: T[], query: string): T[] {
  const q = words(query)
  if (!q.length) return []
  const hits = (text: string) => {
    const w = words(text)
    return q.every((x) => w.some((y) => y.startsWith(x)))
  }
  const named = boards.filter((b) => hits(b.name))
  return [...named, ...boards.filter((b) => !named.includes(b) && hits(`${b.name} ${b.description ?? ''}`))]
}

/** Boards about a topic: the topic their owner chose, or what their name and description say. */
export function boardsAbout<T extends FindableBoard>(boards: T[], topic: Pick<Topic, 'id' | 'terms'>): T[] {
  return boards.filter((b) => b.topic === topic.id || (!b.topic && !!matchesTopic(topic, `${b.name}. ${b.description ?? ''}`)))
}

/** Official boards first, then the busiest this week, then the newest. */
export function byActivity<T extends FindableBoard>(boards: T[]): T[] {
  return [...boards].sort((a, b) => Number(!!b.official) - Number(!!a.official) || (b.active ?? 0) - (a.active ?? 0) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export const activityLabel = (n: number) => (n === 0 ? 'Quiet this week' : n === 1 ? '1 person posting this week' : `${n} people posting this week`)
