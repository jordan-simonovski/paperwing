import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefetchLandingFeed } from './warm'

// Runs before the app renders, on whatever address the app was opened at: an installed app's
// service worker serves the app for any address, typos and links cut short included.
afterEach(() => vi.unstubAllGlobals())
const openAt = (pathname: string) => vi.stubGlobal('location', { pathname, search: '' })

describe('warming up the feed you are opening', () => {
  it('never throws on an address with a stray %, so the app still starts', () => {
    for (const path of ['/t/100%', '/t/%E0%A4%A', '/t/%C0%80/hn-1']) {
      openAt(path)
      expect(() => prefetchLandingFeed(new QueryClient())).not.toThrow()
    }
  })
})
