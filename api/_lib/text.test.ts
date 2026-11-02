import { describe, expect, it } from 'vitest'
import { tagsIn, titleIn } from './text'

// Pages come from anywhere, including someone who wants to stall the function reading them.
const hostile = (s: string) => s.repeat(80_000)
const fast = (fn: () => unknown) => {
  const start = performance.now()
  fn()
  return performance.now() - start
}

describe('reading tags out of a fetched page', () => {
  it('finds every tag of a kind, attributes and all', () => {
    const html = '<head><meta property="og:title" content="A"><link rel="alternate" href="/feed"><META name=description content="B"></head>'
    expect(tagsIn(html, 'meta')).toEqual(['<meta property="og:title" content="A">', '<META name=description content="B">'])
    expect(tagsIn(html, 'link')).toEqual(['<link rel="alternate" href="/feed">'])
  })

  it('reads the <title>', () => {
    expect(titleIn('<head><title lang="en">Hello &amp; welcome</title></head>')).toBe('Hello &amp; welcome')
    expect(titleIn('<head></head>')).toBeUndefined()
  })

  // An unclosed tag repeated thousands of times used to be rescanned to the end of the page from
  // each one: about a minute of a frozen function for 500 KB.
  it.each(['<meta ', '<link ', '<title '])('stays quick on a page full of unclosed "%s"', (tag) => {
    const html = hostile(tag)
    expect(fast(() => tagsIn(html, 'meta'))).toBeLessThan(500)
    expect(fast(() => tagsIn(html, 'link'))).toBeLessThan(500)
    expect(fast(() => titleIn(html))).toBeLessThan(500)
  })
})
