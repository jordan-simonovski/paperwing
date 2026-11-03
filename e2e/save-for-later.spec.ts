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
