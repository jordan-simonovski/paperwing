import { gotoFeed, navigate, row } from './support/app'
import { expect, test } from './support/test'

test('a saved story waits under Saved, even after a reload', async ({ page }) => {
  await gotoFeed(page)

  await row(page, 'The Web We Lost').getByRole('button', { name: 'Save', exact: true }).click()
  // The first save on a device says what saving does.
  await expect(page.getByText(/^Saved to your queue.*reads offline too\.$/)).toBeVisible()
  await expect(row(page, 'The Web We Lost').getByRole('button', { name: 'Remove from saved' })).toBeVisible()

  await navigate(page, /^Saved/)
  await expect(page).toHaveURL(/\/saved$/)
  await expect(page.getByRole('heading', { name: 'Saved', level: 1 })).toBeVisible()
  await expect(row(page, 'The Web We Lost')).toBeVisible()
  await expect(row(page, 'A New Proof Smooths Out the Math of Melting')).toHaveCount(0)

  await page.reload()
  await expect(row(page, 'The Web We Lost')).toBeVisible()
})

test.describe('with motion on', () => {
  // The suite runs with reduced motion, which rightly keeps Pip still; this one needs to see the hop.
  test.use({ contextOptions: { reducedMotion: 'no-preference' } })

  test('reading through the queue says so, and Pip hops only when it happens', async ({ page }) => {
    await gotoFeed(page)
    await navigate(page, /^Saved/)
    // Nothing saved yet: the tips for getting started, not "cleared".
    await expect(page.getByText(/Your queue is empty/)).toBeVisible()

    await navigate(page, /^For you/)
    await row(page, 'The Web We Lost').getByRole('button', { name: 'Save', exact: true }).click()
    await navigate(page, /^Saved/)
    await expect(row(page, 'The Web We Lost')).toBeVisible()
    // Archive it from the keyboard, with focus off the nav link that was just tapped.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('j')
    await page.keyboard.press('e')
    await expect(page.getByText('Queue cleared')).toBeVisible()
    await expect(page.locator('.pip-settle')).toHaveCount(1)

    // Back from the archive, the queue is still cleared, but the hop doesn't replay.
    await page.getByRole('button', { name: /^Archive/ }).click()
    await page.getByRole('button', { name: /^Queue/ }).click()
    await expect(page.getByText('Queue cleared')).toBeVisible()
    await expect(page.locator('.pip-settle')).toHaveCount(0)
  })
})
