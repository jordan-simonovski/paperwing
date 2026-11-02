import { gotoFeed, pane, row } from './support/app'
import { expect, test } from './support/test'

test('the reader view shows the article, and nothing in it runs', async ({ page, net }) => {
  await gotoFeed(page)

  // The headline opens the article itself.
  await row(page, 'The Web We Lost').getByRole('link', { name: 'The Web We Lost' }).click()

  const story = pane(page)
  await expect(story.getByRole('tab', { name: 'Article', selected: true })).toBeVisible()
  await expect(story.getByText('The tech industry and its press have treated')).toBeVisible()
  await expect(story.getByText('Five years ago, most social users could control their own identity.')).toBeVisible()
  await expect(story.getByText('Anil Dash')).toBeVisible()
  expect(net.calls.filter((c) => c.url.pathname === '/api/extract').map((c) => c.url.searchParams.get('url'))).toContain('https://anildash.com/2012/12/13/the_web_we_lost/')

  // The broken image has failed to load by now: had its onerror survived, it would have run.
  const image = story.getByRole('img', { name: 'A broken image' })
  await image.scrollIntoViewIfNeeded()
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete)).toBe(true)
  await expect(image).not.toHaveAttribute('onerror')
  // A javascript: link loses its address.
  await expect(story.getByText('A link that should not run')).not.toHaveAttribute('href')
  expect(await page.evaluate(() => (window as { __pwned?: string }).__pwned)).toBeUndefined()
})
