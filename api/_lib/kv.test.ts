import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cachedInKv, kv, overLimit, resetMemoryKv } from './kv.js'

// The two helpers every allowance and shared cache goes through. Allowances must fail closed:
// a store that can't answer means no, never a free pass.

beforeEach(() => {
  process.env.SYNC_MEMORY = '1'
  resetMemoryKv()
})
afterEach(() => {
  delete process.env.SYNC_MEMORY
  vi.restoreAllMocks()
})

describe('overLimit', () => {
  it('allows up to the limit and refuses one past it, counting what each use costs', async () => {
    expect(await overLimit('k', 60, 3)).toBe(false)
    expect(await overLimit('k', 60, 3, 2)).toBe(false)
    expect(await overLimit('k', 60, 3)).toBe(true)
  })
  it('refuses when the store can’t answer', async () => {
    vi.spyOn(kv(), 'bump').mockRejectedValue(new Error('Sync store answered 503'))
    expect(await overLimit('k', 60, 1000)).toBe(true)
  })
})

describe('cachedInKv', () => {
  it('builds once and serves the stored answer until it expires', async () => {
    const build = vi.fn(async () => ({ n: 1 }))
    expect(await cachedInKv('c', 60, build)).toEqual({ n: 1 })
    expect(await cachedInKv('c', 60, build)).toEqual({ n: 1 })
    expect(build).toHaveBeenCalledTimes(1)
  })
  it('still answers when the store fails, by building', async () => {
    vi.spyOn(kv(), 'get').mockRejectedValue(new Error('down'))
    vi.spyOn(kv(), 'set').mockRejectedValue(new Error('down'))
    expect(await cachedInKv('c', 60, async () => 'fresh')).toBe('fresh')
  })
  it('just builds on a deployment without a store', async () => {
    delete process.env.SYNC_MEMORY
    const build = vi.fn(async () => 'x')
    await cachedInKv('c', 60, build)
    await cachedInKv('c', 60, build)
    expect(build).toHaveBeenCalledTimes(2)
  })
})
