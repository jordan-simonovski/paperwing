import { hit } from './fixtures/upstream'
import { row } from './support/app'
import { expect, test } from './support/test'

const SQLITE = hit(41000003, 'Why SQLite does not use Git', 'https://www.sqlite.org/whynotgit.html', 'drh', 256, 90, 26 * 3_600_000)

test.use({ stubs: { hnSearch: [SQLITE] } })

test('a search shows what the sources found', async ({ page, net }) => {
  await page.goto('/search')

  const search = page.getByRole('searchbox', { name: 'Search' })
  await search.fill('sqlite')
  await search.press('Enter')

  await expect(page).toHaveURL(/\/search\?q=sqlite/)
  await expect(row(page, 'Why SQLite does not use Git')).toBeVisible()
  await expect(row(page, 'The Web We Lost')).toHaveCount(0)
  expect(net.calls.some((c) => c.url.host === 'hn.algolia.com' && c.url.searchParams.get('query') === 'sqlite')).toBe(true)
})
