import { MELTING } from './fixtures/upstream'
import { gotoFeed } from './support/app'
import { expect, test } from './support/test'

const LINK = 'https://blog.example/slow'
test.use({ stubs: { feeds: { paperwing: [MELTING] }, cards: { [LINK]: { title: 'On reading slowly' } } } })

test('posting a link PaperWing hasn’t found: the address, its own title, then where it goes', async ({ page }) => {
  await gotoFeed(page, 'paperwing')
  await page.getByRole('button', { name: 'Post a link' }).click()

  const post = page.getByRole('dialog', { name: 'Post a link' })
  // Typed the way people type addresses: no https://.
  await post.getByLabel('Link').fill('blog.example/slow')
  await expect(post.getByLabel(/Title/)).toHaveValue('On reading slowly')
  await post.getByRole('button', { name: /Next/ }).click()

  const share = page.getByRole('dialog', { name: 'Share' })
  await expect(share.getByLabel('Title')).toHaveValue('On reading slowly')
  // Listing on PaperWing is a Bluesky post: signed out, the sheet says how to sign in.
  await expect(share.getByRole('link', { name: 'Sign in with Bluesky' })).toBeVisible()
})
