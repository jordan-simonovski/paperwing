import { describe, expect, it } from 'vitest'
import { isSealed, open, seal } from './syncCrypto'

const code = 'abcdefghijklmnopqrstuvwxyz'
const other = 'zyxwvutsrqponmlkjihgfedcba'

describe('sealed sync records', () => {
  it('round-trips a record, hiding its key and contents', async () => {
    const r = { key: 's:hn-123', updatedAt: 1700000000000, data: { story: { title: 'Secret title' } } }
    const sealed = await seal(code, r)
    expect(isSealed(sealed)).toBe(true)
    expect(JSON.stringify(sealed)).not.toMatch(/hn-123|Secret/)
    expect(await open(code, sealed)).toEqual(r)
  })
  it('gives an item the same id every time, so the server keeps the newest', async () => {
    const a = await seal(code, { key: 'prefs', updatedAt: 1, data: {} })
    const b = await seal(code, { key: 'prefs', updatedAt: 2, data: { x: 1 } })
    expect(a.key).toBe(b.key)
    expect(a.data).not.toBe(b.data)
    expect((await seal(other, { key: 'prefs', updatedAt: 1, data: {} })).key).not.toBe(a.key)
  })
  it('seals deletions', async () => {
    const sealed = await seal(code, { key: 's:gone', updatedAt: 5, deleted: true })
    expect(sealed.deleted).toBeUndefined()
    expect(await open(code, sealed)).toEqual({ key: 's:gone', updatedAt: 5, deleted: true })
  })
  it("won't open with another code, or once tampered with", async () => {
    const sealed = await seal(code, { key: 'w:hn-1', updatedAt: 10, data: { a: 1 } })
    expect(await open(other, sealed)).toBeUndefined()
    expect(await open(code, { ...sealed, updatedAt: 11 })).toBeUndefined()
    expect(await open(code, { ...sealed, data: String(sealed.data).slice(0, -2) + 'AA' })).toBeUndefined()
  })
  it('passes records from before encryption through', async () => {
    const plain = { key: 's:old', updatedAt: 3, data: { story: {} } }
    expect(await open(code, plain)).toBe(plain)
  })
})
