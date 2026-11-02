import { expect, type Locator, type Page } from '@playwright/test'
import type { Prefs } from '../../src/lib/store'

// Ways into the app and the handful of places journeys look, by what a reader sees.

/** Where zustand keeps the preferences, and the version they're written at (src/lib/store.ts). */
const PREFS_KEY = 'readout:prefs'
const PREFS_VERSION = 6

/**
 * Starts the reader with these preferences (the rest are defaults). Written before the app's
 * first load only: a reload keeps whatever the journey changed since.
 */
export async function seedPrefs(page: Page, prefs: Partial<Prefs>) {
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
    },
    { key: PREFS_KEY, value: JSON.stringify({ state: prefs, version: PREFS_VERSION }) },
  )
}

/** The list of stories on a channel page. */
export const feed = (page: Page) => page.getByRole('feed')

/** One story's row in a list (a channel, Saved, search results), by its headline. */
export const row = (page: Page, title: string) => page.getByRole('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) })

/** Where an opened story shows: beside the list on a desktop, the whole screen on a phone. */
export const pane = (page: Page) => page.getByRole('complementary', { name: 'Reading pane' })

/** Opens a channel (For you unless said) and waits for its first stories. */
export async function gotoFeed(page: Page, channel = 'for-you'): Promise<Locator> {
  await page.goto(`/t/${channel}`)
  await expect(feed(page).getByRole('article').first()).toBeVisible()
  return feed(page)
}

/** Follows a link in the app's navigation: the sidebar on a desktop, the bottom bar on a phone. */
export async function navigate(page: Page, name: string | RegExp) {
  await page.getByRole('navigation').getByRole('link', { name }).first().click()
}

/** Where the reader's channels are listed: the sidebar on a desktop, the menu on a phone (opened for you). */
export async function channelList(page: Page): Promise<Locator> {
  const menu = page.getByRole('button', { name: 'Menu' })
  if (!(await menu.isVisible())) return page.getByRole('navigation', { name: 'Channels' })
  await menu.click()
  return page.getByRole('dialog', { name: 'Menu' })
}

/** Leaves an open story the way a reader would: Back on a phone, Close beside the list. */
export async function closeStory(page: Page) {
  await pane(page)
    .getByRole('button', { name: /^(Back|Close)$/ })
    .click()
}
