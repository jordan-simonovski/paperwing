import { describe, expect, it, vi } from 'vitest'
import { once } from './once'

describe('once', () => {
  it('loads once and shares it between callers', async () => {
    const load = vi.fn(async () => 'marked')
    const get = once(load)
    expect(await Promise.all([get(), get()])).toEqual(['marked', 'marked'])
    expect(await get()).toBe('marked')
    expect(load).toHaveBeenCalledTimes(1)
  })

  // A chunk that didn't arrive (a dropped connection, a deploy that renamed it) must not stay failed for the session.
  it('forgets a failed load, so the next call tries again', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module')).mockResolvedValue('marked')
    const get = once(load)
    await expect(get()).rejects.toThrow('Failed to fetch')
    expect(await get()).toBe('marked')
    expect(load).toHaveBeenCalledTimes(2)
  })
})
