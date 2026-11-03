import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchLinger } from './linger'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('staying with a story', () => {
  it('counts once 45 seconds have passed in sight, and only once', () => {
    const stayed = vi.fn()
    watchLinger(stayed, () => true)
    vi.advanceTimersByTime(40_000)
    expect(stayed).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10_000)
    expect(stayed).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(120_000)
    expect(stayed).toHaveBeenCalledTimes(1)
  })

  it('doesn’t count time out of sight', () => {
    const stayed = vi.fn()
    let visible = false
    watchLinger(stayed, () => visible)
    vi.advanceTimersByTime(120_000)
    expect(stayed).not.toHaveBeenCalled()
    visible = true
    vi.advanceTimersByTime(45_000)
    expect(stayed).toHaveBeenCalledTimes(1)
  })

  it('stops when you move on before then', () => {
    const stayed = vi.fn()
    const stop = watchLinger(stayed, () => true)
    vi.advanceTimersByTime(30_000)
    stop()
    vi.advanceTimersByTime(60_000)
    expect(stayed).not.toHaveBeenCalled()
  })
})
