import { describe, expect, it } from 'vitest'
import { ago } from './format'

describe('ago', () => {
  const now = Date.UTC(2026, 10, 2, 9, 0)
  it('says "just now" for anything under a minute, never "now ago"', () => {
    expect(ago(now - 20_000, now)).toBe('just now')
    expect(ago(now, now)).toBe('just now')
  })
  it('reads as a relative time otherwise', () => {
    expect(ago(now - 5 * 60_000, now)).toBe('5m ago')
    expect(ago(now - 3 * 3_600_000, now)).toBe('3h ago')
  })
})
