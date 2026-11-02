import { closeStory, feed, gotoFeed, pane, row } from './support/app'
import { expect, test } from './support/test'

test('opening a story shows its discussion, and back returns to the list', async ({ page, isMobile }) => {
  await gotoFeed(page)

  await row(page, 'The Web We Lost').getByRole('button', { name: '3 comments' }).click()

  await expect(page).toHaveURL(/\/t\/for-you\/hn-41000001/)
  const story = pane(page)
  await expect(story.getByRole('heading', { name: 'The Web We Lost', level: 1 })).toBeVisible()
  await expect(story.getByRole('tab', { name: /Discussion/, selected: true })).toBeVisible()
  // The thread from Algolia, replies and all.
  await expect(story.getByText('RSS readers were the social network for a lot of us.')).toBeVisible()
  await expect(story.getByText('The tools let you see what people you trusted were reading.')).toBeVisible()
  await expect(story.getByText('I still run my blog with an RSS feed and webmentions.')).toBeVisible()

  // A phone gives the story the whole screen; a desktop keeps the list beside it.
  const width = page.viewportSize()!.width
  const box = (await story.boundingBox())!
  if (isMobile) expect(box.width).toBe(width)
  else {
    expect(box.width).toBeLessThan(width)
    await expect(row(page, 'The Web We Lost')).toBeInViewport()
  }

  await closeStory(page)
  await expect(page).toHaveURL(/\/t\/for-you$/)
  await expect(story.getByRole('heading', { name: 'The Web We Lost', level: 1 })).toBeHidden()
  await expect(row(page, 'The Web We Lost')).toBeInViewport()
  await expect(feed(page).getByRole('article')).toHaveCount(4)
})
