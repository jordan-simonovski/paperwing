import { describe, expect, it } from 'vitest'
import { pickVisible } from './threadBudget'
import type { Comment } from './types'

let n = 0
const c = (children: Comment[] = []): Comment => ({ id: `c${n++}`, author: 'a', createdAt: 0, html: '', children })
const chain = (len: number): Comment => (len <= 1 ? c() : c([chain(len - 1)]))

describe('pickVisible', () => {
  it('builds everything when the thread fits the budget', () => {
    const roots = [c([c(), c()]), c()]
    expect(pickVisible(roots, 80).size).toBe(4)
  })
  it('caps at the budget and never builds a reply without its parent', () => {
    const roots = Array.from({ length: 40 }, () => c(Array.from({ length: 10 }, () => c([chain(20)]))))
    const parentOf = new Map<string, string>()
    const walk = (cs: Comment[], p?: string) => cs.forEach((x) => (p && parentOf.set(x.id, p), walk(x.children, x.id)))
    walk(roots)
    const shown = pickVisible(roots, 80)
    expect(shown.size).toBe(80)
    for (const id of shown) {
      const p = parentOf.get(id)
      if (p) expect(shown.has(p)).toBe(true)
    }
  })
  it('shows several top comments before going deep into the first', () => {
    const roots = Array.from({ length: 30 }, () => chain(100))
    const shown = pickVisible(roots, 80)
    expect(roots.filter((r) => shown.has(r.id)).length).toBeGreaterThanOrEqual(16)
  })
  it('keeps growing with the budget', () => {
    const roots = Array.from({ length: 10 }, () => c(Array.from({ length: 20 }, () => c())))
    expect(pickVisible(roots, 160).size).toBe(160)
    expect(pickVisible(roots, 1000).size).toBe(210)
  })
})
