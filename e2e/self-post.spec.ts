import { SELF_POST, SELF_POST_BODY, SELF_POST_THREAD } from './fixtures/upstream'
import { gotoFeed, pane, row } from './support/app'
import { expect, test } from './support/test'

test.use({
  stubs: {
    feeds: { paperwing: [SELF_POST] },
    blueskyThreads: { [SELF_POST.ref!.uri]: SELF_POST_THREAD },
    selfPosts: { [SELF_POST.key]: SELF_POST_BODY },
  },
})

test('a self post opens to its words, says it was edited, and shows what it said before', async ({ page }) => {
  await gotoFeed(page, 'paperwing')
  await row(page, SELF_POST.title).getByRole('button', { name: '1 comment' }).click()

  const story = pane(page)
  await expect(story.getByRole('heading', { name: SELF_POST.title, level: 1 })).toBeVisible()
  // The words from PaperWing, as Markdown, not the Bluesky post's snippet.
  await expect(story.getByText('Piranesi', { exact: true })).toHaveJSProperty('tagName', 'STRONG')
  await expect(story.getByRole('listitem').filter({ hasText: 'Tell me yours' })).toBeVisible()
  // Its replies on Bluesky are its comments.
  await expect(story.getByText('The Dispossessed, for the third time.')).toBeVisible()

  await story.getByRole('button', { name: 'Edited 2h ago' }).click()
  const versions = page.getByRole('dialog', { name: 'Versions' })
  await expect(versions.getByRole('region', { name: 'Original version' })).toContainText('I’m on Piranesi.')
  await expect(versions.getByRole('region', { name: 'Original version' })).not.toContainText('wonderfully strange')
})

test('writing a post: a title, Markdown with a toolbar and a preview, then where it goes', async ({ page }) => {
  await gotoFeed(page, 'for-you')
  await page.getByRole('button', { name: 'Post a link' }).filter({ visible: true }).first().click()
  await page.getByRole('dialog', { name: 'Post a link' }).getByRole('button', { name: 'Write a post instead' }).click()

  const write = page.getByRole('dialog', { name: 'Write a post' })
  await write.getByRole('textbox', { name: 'Title' }).fill('What are you reading?')
  const words = write.getByRole('textbox', { name: 'Your post' })
  await words.fill('Tell me ')
  await write.getByRole('button', { name: 'Bold' }).click()
  await words.pressSequentially('everything')
  await expect(words).toHaveValue('Tell me **everything**')

  await write.getByRole('tab', { name: 'Preview' }).click()
  await expect(write.getByText('everything', { exact: true })).toHaveJSProperty('tagName', 'STRONG')

  // A self post is a Bluesky post: signed out, the sheet says how to sign in, and can't post.
  await expect(write.getByRole('link', { name: 'Sign in with Bluesky' })).toBeVisible()
  await expect(write.getByRole('button', { name: 'Post', exact: true })).toBeDisabled()
})
