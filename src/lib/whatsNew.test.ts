import { describe, expect, it } from 'vitest'
import { isNewer } from './whatsNew'

describe('a newer release', () => {
  it('compares versions as numbers, not text', () => {
    expect(isNewer('0.10.0', '0.9.0')).toBe(true)
    expect(isNewer('1.0.0', '0.12.4')).toBe(true)
    expect(isNewer('0.2.0', '0.2.0')).toBe(false)
    expect(isNewer('0.2.0', '0.3.0')).toBe(false)
  })
  it('counts every release as new until you have looked once', () => {
    expect(isNewer('0.1.0', undefined)).toBe(true)
  })
})
