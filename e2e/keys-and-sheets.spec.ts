import { closeStory, gotoFeed, pane, row } from './support/app'
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

// A sheet is modal: Tab goes round inside it, and closing it puts you back where you were.
test('Tab stays inside an open sheet, and closing it returns to the button that opened it', async ({ page }) => {
  await gotoFeed(page)
  const share = row(page, 'The Web We Lost').getByRole('button', { name: 'Share' })
  await share.focus()
  await page.keyboard.press('Enter')
  const sheet = page.getByRole('dialog', { name: 'Share' })
  await expect(sheet).toBeVisible()

  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab')
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  }
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Shift+Tab')
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  }

  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(share).toBeFocused()
})

// On a phone the reader covers the list, so focus goes into it, and comes back to the story's row.
test('on a phone, the reader takes focus as it opens and gives it back to the row', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The reader only covers the list on a phone')
  await gotoFeed(page)
  await row(page, 'The Web We Lost').getByRole('heading', { name: 'The Web We Lost' }).getByRole('link').click()
  const story = pane(page)
  await expect(story.getByRole('heading', { name: 'The Web We Lost', level: 1 })).toBeVisible()
  await expect(story).toBeFocused()

  await page.keyboard.press('Tab')
  await expect(story.getByRole('button', { name: 'Back' })).toBeFocused()

  await closeStory(page)
  const link = (title: string) => row(page, title).getByRole('heading', { name: title }).getByRole('link')
  await expect(link('The Web We Lost')).toBeFocused()

  // From there the arrows still walk the list, and Enter opens the story they land on.
  const titles = await page.locator('.row-title').allInnerTexts()
  const next = titles[titles.indexOf('The Web We Lost') + 1]
  await page.keyboard.press('ArrowDown')
  await expect(link(next)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(story.getByRole('heading', { name: next, level: 1 })).toBeVisible()
})
