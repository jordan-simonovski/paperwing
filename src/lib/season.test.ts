import { describe, expect, it } from 'vitest'
import { easter, seasonOf } from './season'

const on = (y: number, m: number, d: number) => seasonOf(new Date(y, m - 1, d, 12))

describe('seasons', () => {
  it('finds Easter Sunday', () => {
    expect(easter(2026).toDateString()).toBe(new Date(2026, 3, 5).toDateString())
    expect(easter(2027).toDateString()).toBe(new Date(2027, 2, 28).toDateString())
    expect(easter(2025).toDateString()).toBe(new Date(2025, 3, 20).toDateString())
  })

  it('knows each season and its edges', () => {
    expect(on(2026, 12, 1)).toBe('christmas')
    expect(on(2026, 12, 26)).toBe('christmas')
    expect(on(2026, 12, 27)).toBeUndefined()
    expect(on(2026, 12, 31)).toBe('newyear')
    expect(on(2027, 1, 2)).toBe('newyear')
    expect(on(2027, 1, 3)).toBeUndefined()
    expect(on(2027, 2, 14)).toBe('valentine')
    expect(on(2026, 10, 24)).toBe('halloween')
    expect(on(2026, 10, 31)).toBe('halloween')
    expect(on(2026, 11, 1)).toBeUndefined()
    // Good Friday to Easter Monday, 2026: 3 to 6 April.
    expect(on(2026, 4, 2)).toBeUndefined()
    expect(on(2026, 4, 3)).toBe('easter')
    expect(on(2026, 4, 6)).toBe('easter')
    expect(on(2026, 4, 7)).toBeUndefined()
  })
})
