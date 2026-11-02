import { gotoFeed, pane, row } from './support/app'
import { expect, test } from './support/test'

// Keyboard shortcuts belong to whatever is on top: with a sheet open, its keys are its own.
test('Escape closes the sheet on top, and leaves the story open under it', async ({ page }) => {
  await gotoFeed(page)
  await row(page, 'The Web We Lost').getByRole('button', { name: '3 comments' }).click()
  const story = pane(page)
  await expect(story.getByRole('heading', { name: 'The Web We Lost', level: 1 })).toBeVisible()

  await story.getByTitle('Share').click()
  const sheet = page.getByRole('dialog', { name: 'Share' })
  await expect(sheet).toBeVisible()
  // List shortcuts don't reach past it either: x would hide the story.
  await page.keyboard.press('x')
  await page.keyboard.press('Escape')

  await expect(sheet).toBeHidden()
  await expect(page).toHaveURL(/\/t\/for-you\/hn-41000001/)
  await expect(story.getByRole('heading', { name: 'The Web We Lost', level: 1 })).toBeVisible()
})
