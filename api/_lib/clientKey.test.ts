import { describe, expect, it } from 'vitest'
import { webUrl } from '../../src/lib/webUrl.js'
import { clientKey } from './http.js'

const from = (ip: string) => clientKey(new Request('https://paperwing.io/api/x', { headers: { 'x-forwarded-for': ip } }))

describe('clientKey', () => {
  it('counts a whole IPv6 /64 as one caller', () => {
    expect(from('2001:db8:1:2::1')).toBe(from('2001:db8:1:2:ffff:1:2:3'))
    expect(from('2001:db8:1:2::1')).not.toBe(from('2001:db8:1:3::1'))
  })
  it('keeps IPv4 addresses apart and never returns the address', () => {
    expect(from('203.0.113.1')).not.toBe(from('203.0.113.2'))
    expect(from('203.0.113.1')).not.toContain('203')
  })
})

describe('webUrl', () => {
  it('keeps web links only', () => {
    expect(webUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(webUrl('javascript:alert(1)')).toBeUndefined()
    expect(webUrl('ms-msdt:/id')).toBeUndefined()
    expect(webUrl('/share?url=x')).toBeUndefined()
  })
})
