import { describe, expect, it } from 'vitest'
import { citedRefs, cleanSummary, worthUpdating } from './summaryCache'
import type { DiscussionSummary } from './summaryTypes'

const summary: DiscussionSummary = {
  gist: 'People argue about it.',
  themes: [{ title: 'Speed', summary: 'Faster.', comments: ['h1.1', 'h1.2'] }],
  disagreements: [{ question: 'Worth it?', sides: [{ view: 'Yes', comments: ['h1.3'] }] }],
  standouts: [{ comment: 'h1.1', why: 'Firsthand.' }],
  contrast: null,
}
const ref = (id: string) => ({ threadKey: 'hn:1', commentId: id, author: 'a' })

describe('summary cache', () => {
  it('keeps only the refs a summary cites', () => {
    const refs = new Map(['h1.1', 'h1.2', 'h1.3', 'h1.4', 'h1.5'].map((r) => [r, ref(r)]))
    expect(citedRefs(summary, refs).map(([r]) => r)).toEqual(['h1.1', 'h1.2', 'h1.3'])
  })

  it('offers an update only once the discussion has grown', () => {
    expect(worthUpdating({ comments: 40 }, 50)).toBe(false)
    expect(worthUpdating({ comments: 40 }, 55)).toBe(true)
    expect(worthUpdating({ comments: 400 }, 480)).toBe(false)
    expect(worthUpdating({ comments: 400 }, 500)).toBe(true)
  })

  it('accepts a synced summary only under its own story', () => {
    const s = { key: 'hn:1', summary, model: 'm', refs: [['h1.1', ref('1')]], sent: 10, total: 20, comments: 20, places: ['HN'], at: 1, updatedAt: 1 }
    expect(cleanSummary('hn:1', s)?.refs).toHaveLength(1)
    expect(cleanSummary('hn:2', s)).toBeUndefined()
    expect(cleanSummary('hn:1', { ...s, summary: { gist: 'x' } })).toBeUndefined()
    expect(cleanSummary('hn:1', { ...s, refs: [['h1.1', { nope: 1 }]] })?.refs).toEqual([])
  })
})
