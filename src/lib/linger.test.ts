import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchLinger, watchOpen } from './linger'

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

describe('opening a story', () => {
  it('counts once it has been open a moment', () => {
    const opened = vi.fn()
    watchOpen(opened)
    vi.advanceTimersByTime(1_500)
    expect(opened).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1_000)
    expect(opened).toHaveBeenCalledTimes(1)
  })

  it('doesn’t count a story skimmed past on the way to another', () => {
    const opened = vi.fn()
    const stop = watchOpen(opened)
    vi.advanceTimersByTime(300)
    stop()
    vi.advanceTimersByTime(10_000)
    expect(opened).not.toHaveBeenCalled()
  })
})
