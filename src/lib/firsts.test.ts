import { beforeEach, describe, expect, it } from 'vitest'
import { firstTime } from './firsts'
import { usePrefs } from './store'

describe('firstTime', () => {
  beforeEach(() => usePrefs.setState({ firsts: [] }))

  it('answers yes once per moment, then no for good', () => {
    expect(firstTime('save')).toBe(true)
    expect(firstTime('save')).toBe(false)
    expect(firstTime('post')).toBe(true)
    expect(usePrefs.getState().firsts).toEqual(['save', 'post'])
  })

  it("doesn't count as a synced preference change", () => {
    usePrefs.setState({ syncedPrefsAt: 5 })
    firstTime('post')
    expect(usePrefs.getState().syncedPrefsAt).toBe(5)
  })
})
