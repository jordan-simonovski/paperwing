import type { Page } from '@playwright/test'
import { channelList, closeStory, feed, gotoFeed, navigate, pane, row } from './support/app'
import { expect, test } from './support/test'
import { story } from '../src/test/fixtures'

// Enough stories in every news feed that the list runs well past one screen.
const many = Array.from({ length: 40 }, (_, i) =>
  story({ key: `rss-scroll-${i}`, source: 'rss', sourceLabel: 'Wire', title: `Story number ${i + 1} on the wire`, url: `https://example.com/wire/${i + 1}`, hasThread: false }),
)
test.use({ prefs: { followed: ['world-news', 'science'] }, stubs: { feeds: { rss: many } } })

/** How far the feed is scrolled: the page on a phone, the list beside the reading pane on a desktop. */
const scrolled = (page: Page) => page.evaluate(() => Math.max(window.scrollY, document.getElementById('list-scroll')?.scrollTop ?? 0))

const scrollDown = async (page: Page) => {
  await page.evaluate(() => {
    window.scrollTo(0, 2000)
    const list = document.getElementById('list-scroll')
    if (list) list.scrollTop = 2000
  })
  await expect.poll(() => scrolled(page)).toBeGreaterThan(500)
}

test('switching topics starts the new one at the top', async ({ page }) => {
  await gotoFeed(page, 'world-news')
  await scrollDown(page)

  const channels = await channelList(page)
  await channels.getByRole('link', { name: 'Science', exact: true }).click()
  await expect(page).toHaveURL(/\/t\/science$/)
  await expect(feed(page).getByRole('article').first()).toBeVisible()
  await expect.poll(() => scrolled(page)).toBe(0)
})

test('reading a story and coming back keeps your place in the feed', async ({ page }) => {
  await gotoFeed(page, 'world-news')
  await scrollDown(page)
  const read = row(page, 'Story number 20 on the wire')
  await read.getByRole('link', { name: 'Story number 20 on the wire' }).click()
  await expect(pane(page).getByRole('heading', { level: 1, name: 'Story number 20 on the wire' })).toBeVisible()
  await closeStory(page)
  await expect(page).toHaveURL(/\/t\/world-news$/)
  // Back on the story you read, not at the top.
  await expect(read).toBeInViewport()
  expect(await scrolled(page)).toBeGreaterThan(500)
})

// On a phone the page itself scrolls and the browser puts it back on Back; a reset would undo that.
// (Beside the reading pane the list column starts over, as it always has.)
test('on a phone, Back from another page doesn’t start the feed over at the top', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the page itself only scrolls on a phone')
  await gotoFeed(page, 'world-news')
  await scrollDown(page)
  await navigate(page, /^Saved/)
  await expect(page).toHaveURL(/\/saved/)
  await page.goBack()
  await expect(page).toHaveURL(/\/t\/world-news$/)
  await expect(feed(page).getByRole('article').first()).toBeAttached()
  await expect.poll(() => scrolled(page)).toBeGreaterThan(500)
})
