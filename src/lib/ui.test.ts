import { afterEach, describe, expect, it, vi } from 'vitest'
import { share, useUI } from './ui'

afterEach(() => {
  vi.unstubAllGlobals()
  useUI.setState({ toasts: [] })
})

describe('sharing a link with the device', () => {
  it('sends the title and link to native sharing without copying them', async () => {
    const native = vi.fn().mockResolvedValue(undefined)
    const copy = vi.fn()
    vi.stubGlobal('navigator', { share: native, clipboard: { writeText: copy } })
    await share('Space', 'https://paperwing.io/t/space')
    expect(native).toHaveBeenCalledWith({ title: 'Space', url: 'https://paperwing.io/t/space' })
    expect(copy).not.toHaveBeenCalled()
  })
  it('treats cancellation as done without copying or reporting an error', async () => {
    const copy = vi.fn()
    vi.stubGlobal('navigator', {
      share: async () => {
        throw new DOMException('Cancelled', 'AbortError')
      },
      clipboard: { writeText: copy },
    })
    await share('Space', 'https://paperwing.io/t/space')
    expect(copy).not.toHaveBeenCalled()
    expect(useUI.getState().toasts).toEqual([])
  })
  it('copies the link when native sharing is unavailable or fails', async () => {
    for (const native of [
      undefined,
      async () => {
        throw new Error('Unavailable')
      },
    ]) {
      const copy = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { share: native, clipboard: { writeText: copy } })
      await share('Space', 'https://paperwing.io/t/space')
      expect(copy).toHaveBeenCalledWith('https://paperwing.io/t/space')
      expect(useUI.getState().toasts.at(-1)?.message).toBe('Link copied')
    }
  })
  it('lets the caller show a fallback when both device APIs fail', async () => {
    vi.stubGlobal('navigator', {
      share: async () => {
        throw new Error('Unavailable')
      },
      clipboard: {
        writeText: async () => {
          throw new Error('Clipboard denied')
        },
      },
    })
    await expect(share('Space', 'https://paperwing.io/t/space')).rejects.toThrow('Clipboard denied')
    expect(useUI.getState().toasts).toEqual([])
  })
})
