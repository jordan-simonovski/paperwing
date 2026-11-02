import { test as base, expect } from '@playwright/test'
import type { Prefs } from '../../src/lib/store'
import { NOW } from '../fixtures/upstream'
import { seedPrefs } from './app'
import { stubNetwork, type Network, type Stubs } from './network'

// The `test` every journey uses. Before the page loads it answers the network from fixtures
// (network.ts), pins the clock to the fixtures' NOW and seeds preferences; afterwards it fails the
// test on any uncaught error in the page. A journey changes what it needs with test.use():
//
//   test.use({ stubs: { feeds: { 'rss:Quanta': fail(500) } } })   // a source that's down
//   test.use({ prefs: { followed: ['space'] } })                   // a reader who follows Space
//   test.use({ prefs: null })                                      // a newcomer: nothing saved

interface Options {
  /** Merged over the default stubbed world (network.ts). */
  stubs: Partial<Stubs>
  /** The reader's saved preferences, over those of someone who has waved the tour away; null for a first visit. */
  prefs: Partial<Prefs> | null
}

export const test = base.extend<Options & { net: Network }>({
  stubs: [{}, { option: true }],
  prefs: [{}, { option: true }],

  // Automatic: no journey runs with the real network, whether or not it looks at `net`.
  net: [
    async ({ page, stubs }, use, testInfo) => {
      const net = await stubNetwork(page, stubs)
      await use(net)
      // Not a failure on its own (the journey's assertions say what matters), but the first place to look when one fails.
      if (net.blocked.length || net.unhandled.length) {
        await testInfo.attach('unstubbed requests', { body: [...net.blocked, ...net.unhandled].join('\n'), contentType: 'text/plain' })
      }
    },
    { auto: true },
  ],

  page: async ({ page, prefs }, use) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.stack ?? err.message))
    await page.clock.setFixedTime(NOW)
    // Playwright's service worker blocking leaves register() resolving to nothing, which the app
    // can't expect from a real browser. Without the API at all it takes its no-service-worker path.
    await page.addInitScript(() => delete (Navigator.prototype as { serviceWorker?: unknown }).serviceWorker)
    if (prefs) await seedPrefs(page, { welcomed: true, ...prefs })
    await use(page)
    expect(errors, 'uncaught errors in the page').toEqual([])
  },
})

export { expect }
