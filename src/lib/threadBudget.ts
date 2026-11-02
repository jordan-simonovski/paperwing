import type { Comment } from './types'

// Long threads are built a slice at a time. A 1,500-comment HN thread is ~12,000 elements, and
// building or tearing all of that down at once freezes a phone for a second or more. The first
// slice is shaped for skimming: the top comments, then a few replies to each, level by level.
export const BATCH = 80
/** Replies built per comment at each depth before "more replies": 4 under a top comment, then 2, then 1. */
const REPLY_CAPS = [4, 2, 1]

/** Which comments to build for a budget. Every built comment's parent is built too. */
export function pickVisible(roots: Comment[], budget: number): Set<string> {
  const out = new Set<string>()
  let left = budget
  let frontier = roots.slice(0, Math.max(5, Math.ceil(budget / 5)))
  for (const r of frontier) out.add(r.id)
  left -= frontier.length
  for (let depth = 0; frontier.length && left > 0; depth++) {
    const cap = REPLY_CAPS[Math.min(depth, REPLY_CAPS.length - 1)]
    const next: Comment[] = []
    for (const p of frontier) {
      for (const k of p.children.slice(0, cap)) {
        if (left <= 0) break
        out.add(k.id)
        left--
        next.push(k)
      }
    }
    frontier = next
  }
  // Budget left once every cap is used: keep going in reading order, so "show more" always shows more.
  const fill = (cs: Comment[], parentShown: boolean) => {
    for (const c of cs) {
      if (left <= 0) return
      if (!out.has(c.id) && parentShown) {
        out.add(c.id)
        left--
      }
      fill(c.children, out.has(c.id))
    }
  }
  if (left > 0) fill(roots, true)
  return out
}
