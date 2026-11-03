import { expect, test } from './support/test'
import { row } from './support/app'
import { story } from '../src/test/fixtures'

const publication = { url: 'https://lab.leaflet.pub', title: 'Leaflet Lab Notes', site: 'lab.leaflet.pub', posts: 0, format: 'standard' as const }
const article = story({ key: 'ln-native-publication', source: 'rss', sourceLabel: publication.title, title: 'Publishing on the open web', url: 'https://lab.leaflet.pub/open-web', hasThread: false })

test.use({ prefs: { followed: ['world-news'] }, stubs: { discover: [publication], feeds: { [`standard:${publication.title}`]: [article] } } })

test('following a Standard.site publication reads its native feed and keeps it after reload', async ({ page, net }) => {
  await page.goto('/explore/publishers')
  await page.getByRole('textbox', { name: 'Site to follow' }).fill(publication.url)
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  const result = page.getByRole('group', { name: publication.title, exact: true })
  await result.getByRole('button', { name: 'Follow', exact: true }).click()
  await expect(result.getByRole('button', { name: 'Following', exact: true })).toBeDisabled()
  await page.reload()
  await page.goto(`/t/${encodeURIComponent(`feed:${publication.url}`)}`)
  await expect(row(page, article.title)).toBeVisible()
  expect(net.unhandled).toEqual([])
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('readout:prefs')!).state.customFeeds)
  expect(prefs).toContainEqual({ url: publication.url, label: publication.title, site: publication.site, format: 'standard' })
})
