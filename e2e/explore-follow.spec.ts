import { STARSHIP } from './fixtures/upstream'
import { channelList, gotoFeed, navigate, row } from './support/app'
import { expect, test } from './support/test'

test.use({ stubs: { feeds: { 'rss:SpaceNews': [STARSHIP] } } })

test('following a topic from Explore adds it to your channels, with its stories', async ({ page }) => {
  await gotoFeed(page)
  await navigate(page, 'Explore')
  await expect(page).toHaveURL(/\/explore$/)

  const follow = page.getByRole('button', { name: 'Follow Space' })
  await follow.click()
  await expect(page.getByRole('button', { name: 'Following Space' })).toHaveAttribute('aria-pressed', 'true')

  const channels = await channelList(page)
  await channels.getByRole('link', { name: 'Space', exact: true }).click()

  await expect(page).toHaveURL(/\/t\/space$/)
  await expect(page.getByRole('heading', { name: 'Space', level: 1 })).toBeVisible()
  await expect(row(page, STARSHIP.title)).toBeVisible()
})
