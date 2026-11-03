import { gotoFeed } from './support/app'
import { expect, test } from './support/test'

// A reader who has voted Space up a lot: Hot says where that lifted a story; Latest, ordered by time, doesn't.
test.use({ prefs: { affinity: { 't:space': 3, 'd:en.wikipedia.org': 2 } } })

test('a row in Hot says when your taste lifted it, and Latest stays quiet', async ({ page }) => {
  await gotoFeed(page)
  await expect(page.getByText(/^Up for you: you like/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Latest' }).click()
  await expect(page.getByText(/^Up for you/)).toHaveCount(0)
})
