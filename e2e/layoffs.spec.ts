import { DROPBOX_HIRING, DROPBOX_LAYOFFS, MICROSOFT_WARN } from './fixtures/upstream'
import { gotoFeed, pane, row } from './support/app'
import { expect, test } from './support/test'

test.use({
  prefs: { followed: ['layoffs'] },
  stubs: { feeds: { 'rss:TechCrunch Layoffs': [DROPBOX_LAYOFFS], warn: [MICROSOFT_WARN] }, hiring: { Dropbox: DROPBOX_HIRING } },
})

test('a story about one company’s layoffs shows what it is still hiring for', async ({ page }) => {
  await gotoFeed(page, 'layoffs')
  await row(page, DROPBOX_LAYOFFS.title).getByRole('heading').click()

  const story = pane(page)
  await story.getByRole('tab', { name: 'Related' }).click()
  await expect(story.getByRole('heading', { name: 'Still hiring' })).toBeVisible()
  await expect(story.getByText('posted in the last two weeks', { exact: false })).toBeVisible()
  await expect(story.getByRole('link', { name: /Senior Backend Engineer/ })).toHaveAttribute('href', DROPBOX_HIRING.latest[0].url)
  await expect(story.getByRole('link', { name: /See every opening/ })).toHaveAttribute('href', DROPBOX_HIRING.board)
})

test('a WARN notice opens on its details, not an empty thread', async ({ page }) => {
  await gotoFeed(page, 'layoffs')
  await row(page, MICROSOFT_WARN.title).getByRole('heading').click()

  const story = pane(page)
  await expect(story.getByRole('tab', { name: 'Post', selected: true })).toBeVisible()
  await expect(story.getByText('Workers affected:')).toBeVisible()
  // Microsoft's careers site isn't a board PaperWing reads: no panel, and nothing asked for.
  await story.getByRole('tab', { name: 'Related' }).click()
  await expect(story.getByRole('heading', { name: 'Topics' })).toBeVisible()
  await expect(story.getByRole('heading', { name: 'Still hiring' })).toBeHidden()
})
