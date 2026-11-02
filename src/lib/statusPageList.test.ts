import { describe, expect, it } from 'vitest'
import { alertPages, MAX_ALERT_PAGES, STATUS_PAGES } from './statusPageList'

describe('status pages for alerts', () => {
  const builtIn = STATUS_PAGES.slice(0, 3).map((p) => p.id)
  const followed = Array.from({ length: 12 }, (_, i) => `p${i}.example.com`)

  it('keeps every built-in page and the first ten of your own', () => {
    expect(alertPages([...builtIn, ...followed])).toEqual([...builtIn, ...followed.slice(0, MAX_ALERT_PAGES)])
  })

  it('says when no more of your own can be added', () => {
    expect(alertPages.full(followed.slice(0, 9))).toBe(false)
    expect(alertPages.full([...builtIn, ...followed.slice(0, 10)])).toBe(true)
  })

  it('counts only pages you still follow: one you stopped following doesn’t take a place', () => {
    const stillFollowed = followed.slice(0, 9)
    const picked = [...followed.slice(0, 10)]
    expect(alertPages.full(alertPages.of(picked, [...builtIn, ...stillFollowed]))).toBe(false)
    expect(alertPages.of(picked, stillFollowed)).toEqual(stillFollowed)
  })
})
