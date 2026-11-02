import { describe, expect, it, vi } from 'vitest'
import { remembered } from './remembered'

describe('a remembered server answer', () => {
  it('asks once, and every caller shares the answer', async () => {
    const load = vi.fn(async () => 'yes')
    const ask = remembered(load, 'no')
    expect(await Promise.all([ask(), ask()])).toEqual(['yes', 'yes'])
    expect(await ask()).toBe('yes')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('a failure answers with the fallback this time, and is asked again next time', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('yes')
    const ask = remembered(load, 'no')
    expect(await ask()).toBe('no')
    expect(await ask()).toBe('yes')
    expect(await ask()).toBe('yes')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('asks afresh when told to', async () => {
    const load = vi.fn(async () => 'yes')
    const ask = remembered(load, 'no')
    await ask()
    await ask(true)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
