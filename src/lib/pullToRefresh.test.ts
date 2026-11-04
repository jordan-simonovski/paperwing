import { describe, expect, it, vi } from 'vitest'
import { createPullToRefresh } from './pullToRefresh'

function setup(refresh: () => Promise<unknown> = async () => {}) {
  const render = vi.fn()
  const onRefresh = vi.fn(refresh)
  return { gesture: createPullToRefresh(onRefresh, render), render, onRefresh }
}

describe('pull to refresh', () => {
  it('winds up, disarms when pulled back, and cancels a short pull', async () => {
    const { gesture, render, onRefresh } = setup()
    gesture.start(100, 100)
    gesture.move(100, 280)
    expect(render).toHaveBeenLastCalledWith('armed', expect.closeTo(99))
    gesture.move(100, 180)
    expect(render).toHaveBeenLastCalledWith('pulling', 44)
    await gesture.end()
    expect(onRefresh).not.toHaveBeenCalled()
    expect(render).toHaveBeenLastCalledWith('idle', 0)
  })

  it('keeps running until the refresh settles and ignores repeated gestures', async () => {
    let finish!: () => void
    const { gesture, render, onRefresh } = setup(() => new Promise<void>((resolve) => (finish = resolve)))
    gesture.start(100, 100)
    gesture.move(100, 300)
    const done = gesture.end()
    expect(render).toHaveBeenLastCalledWith('refreshing', 104)
    gesture.start(100, 100)
    gesture.move(100, 500)
    await gesture.end()
    gesture.cancel()
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenLastCalledWith('refreshing', 104)
    finish()
    await done
    expect(render).toHaveBeenLastCalledWith('idle', 0)
  })

  it('does not refresh a cancelled, upward or sideways gesture', async () => {
    for (const direction of ['cancel', 'up', 'side']) {
      const { gesture, onRefresh } = setup()
      gesture.start(100, 100)
      if (direction === 'up') gesture.move(100, 70)
      if (direction === 'side') gesture.move(160, 110)
      gesture.move(100, 300)
      if (direction === 'cancel') gesture.cancel()
      await gesture.end()
      expect(onRefresh).not.toHaveBeenCalled()
    }
  })

  it('clears a failed refresh and can be used again', async () => {
    const { gesture, render, onRefresh } = setup(async () => {
      throw new Error('Offline')
    })
    for (let i = 0; i < 2; i++) {
      gesture.start(100, 100)
      gesture.move(100, 300)
      await gesture.end()
      expect(render).toHaveBeenLastCalledWith('idle', 0)
    }
    expect(onRefresh).toHaveBeenCalledTimes(2)
  })

  it('does not render after disposal while a refresh is pending', async () => {
    let finish!: () => void
    const { gesture, render } = setup(() => new Promise<void>((resolve) => (finish = resolve)))
    gesture.start(100, 100)
    gesture.move(100, 300)
    const done = gesture.end()
    gesture.dispose()
    render.mockClear()
    finish()
    await done
    expect(render).not.toHaveBeenCalled()
  })
})
