import { feed, row } from './support/app'
import { expect, test } from './support/test'

// Someone opening PaperWing for the first time: nothing saved, no account.
test.use({ prefs: null })

test('a newcomer lands on For you with stories from every source', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL(/\/t\/for-you$/)
  await expect(page.getByRole('heading', { name: 'For you', level: 1 })).toBeVisible()
  // One story each from Hacker News, an RSS publisher and Lemmy.
  await expect(row(page, 'The Web We Lost')).toBeVisible()
  await expect(row(page, 'A New Proof Smooths Out the Math of Melting')).toBeVisible()
  await expect(row(page, 'A quarter of the ocean floor is now mapped')).toBeVisible()
  await expect(feed(page)).toHaveAttribute('aria-busy', 'false')
})

test('the newcomer bar goes when waved away, and stays gone', async ({ page }) => {
  await page.goto('/')
  const welcome = page.getByRole('region', { name: 'Welcome' })
  await expect(welcome).toContainText('New here?')

  await welcome.getByRole('button', { name: 'Not now' }).click()
  await expect(welcome).toBeHidden()

  await page.reload()
  await expect(row(page, 'The Web We Lost')).toBeVisible()
  await expect(welcome).toBeHidden()
})
