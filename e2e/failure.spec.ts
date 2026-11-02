import { fail } from './support/network'
import { gotoFeed, row } from './support/app'
import { expect, test } from './support/test'

test.describe('with Hacker News down', () => {
  test.use({ stubs: { hnTop: fail(500) } })

  test('For you still shows every other source', async ({ page }) => {
    await gotoFeed(page)

    await expect(row(page, 'A New Proof Smooths Out the Math of Melting')).toBeVisible()
    await expect(row(page, 'A quarter of the ocean floor is now mapped')).toBeVisible()
    await expect(row(page, 'The Web We Lost')).toHaveCount(0)
    await expect(page.getByText('Nothing came through')).toBeHidden()

    // The failure is owned up to, and says which source and why.
    await page.getByRole('button', { name: /^1 sources? failed$/ }).click()
    await expect(page.getByText('Hacker News: The feed answered 500')).toBeVisible()
  })
})

test('an address that leads nowhere lands on For you', async ({ page }) => {
  await page.goto('/no/such/page')

  await expect(page).toHaveURL(/\/t\/for-you$/)
  await expect(row(page, 'The Web We Lost')).toBeVisible()
})
