import { describe, expect, it } from 'vitest'
import { shortenHistories } from './self-post-history-expiry.mjs'

describe('shortening self-post histories kept from before the one-day change', () => {
  it('brings every one living longer than a day down to a day, across every page of keys', async () => {
    const ttls = { 'pw:self:a': 31_000_000, 'pw:self:b': 3_600, 'pw:self:c': -1, 'pw:self:d': 90_000 }
    const pages = { 0: ['7', ['pw:self:a', 'pw:self:b']], 7: ['0', ['pw:self:c', 'pw:self:d']] }
    const command = async ([name, ...args]) => {
      if (name === 'SCAN') {
        expect(args.slice(1, 3)).toEqual(['MATCH', 'pw:self:*'])
        return pages[args[0]]
      }
      if (name === 'TTL') return ttls[args[0]]
      if (name === 'EXPIRE') return (ttls[args[0]] = args[1]), 1
      throw new Error(`unexpected ${name}`)
    }
    expect(await shortenHistories(command)).toBe(3)
    expect(ttls).toEqual({ 'pw:self:a': 86_400, 'pw:self:b': 3_600, 'pw:self:c': 86_400, 'pw:self:d': 86_400 })
    // Run again, it has nothing left to do.
    expect(await shortenHistories(command)).toBe(0)
  })
})
