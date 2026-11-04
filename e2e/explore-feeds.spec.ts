import { MELTING } from './fixtures/upstream'
import { channelList, closeStory, pane, row } from './support/app'
import { expect, test } from './support/test'

const DID = 'did:plc:feedcreatorexampleabcdef'
const uri = `at://${DID}/app.bsky.feed.generator/science`
const list = `at://${DID}/app.bsky.graph.list/journalists`
const post = {
  uri: `at://${DID}/app.bsky.feed.post/3m2scienceaaa`,
  cid: 'bafytest',
  author: { did: DID, handle: 'science.example', displayName: 'Science writer' },
  record: { text: 'A new view of the stars', createdAt: '2026-10-30T10:00:00Z' },
  indexedAt: '2026-10-30T10:00:00Z',
  likeCount: 10,
  replyCount: 0,
}

test.use({ prefs: { followed: ['science'], bskyFeeds: [] }, stubs: { feeds: { 'rss:Reading notes': [MELTING] }, bluesky: { [uri]: [{ post }], [list]: [{ post }] } } })

test.beforeEach(async ({ page }) => {
  await page.route('**/xrpc/app.bsky.unspecced.getPopularFeedGenerators?*', (route) =>
    route.fulfill({ json: { feeds: [{ uri, displayName: 'Science', creator: { handle: 'science.example' }, likeCount: 42 }] } }),
  )
  await page.route('**/xrpc/app.bsky.graph.getList?*', (route) => route.fulfill({ json: { list: { name: 'Journalists' } } }))
})

test('add a feed, open it, and find it again after a reload', async ({ page }) => {
  await page.goto('/explore/feeds')
  await page.getByRole('button', { name: 'Add Science' }).click()
  await page.getByRole('button', { name: 'Open feed', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Science', exact: true }).first()).toBeVisible()
  await expect(row(page, 'A new view of the stars')).toBeVisible()
  const channels = await channelList(page)
  await channels.getByRole('link', { name: 'Bluesky feeds', exact: true }).click()
  await page.reload()
  const yours = page.getByRole('region', { name: 'Your feeds' })
  await yours.getByRole('link', { name: 'Open Science' }).click()
  await expect(row(page, 'A new view of the stars')).toBeVisible()
})

test('paste a list link and open its stories without signing in', async ({ page }) => {
  await page.goto('/explore/feeds')
  await page.getByRole('textbox', { name: 'Bluesky feed or list link' }).fill(`https://bsky.app/profile/${DID}/lists/journalists`)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('region', { name: 'Your feeds' }).getByRole('link', { name: 'Open Journalists' }).click()
  await expect(row(page, 'A new view of the stars')).toBeVisible()
})

test('your feeds stay available when discovery fails and can be removed', async ({ page }) => {
  await page.goto('/explore/feeds')
  await page.getByRole('button', { name: 'Add Science' }).click()
  await page.route('**/xrpc/app.bsky.unspecced.getPopularFeedGenerators?*', (route) => route.fulfill({ status: 503, json: { error: 'Unavailable' } }))
  await page.reload()
  const yours = page.getByRole('region', { name: 'Your feeds' })
  await expect(yours.getByRole('link', { name: 'Open Science' })).toBeVisible()
  await yours.getByRole('button', { name: 'Remove Science' }).click()
  await expect(yours.getByRole('link', { name: 'Open Science' })).toHaveCount(0)
  await expect(yours.getByText(/No feeds added yet/)).toBeVisible()
})

test('a followed publisher can be opened and found again', async ({ page }) => {
  await page.route('**/api/feed?src=discover*', (route) =>
    route.fulfill({ json: [{ url: 'https://reading.example/feed.xml?kind=news&lang=en', title: 'Reading notes', site: 'reading.example', posts: 0 }] }),
  )
  await page.goto('/explore/publishers')
  await page.getByRole('textbox', { name: 'Site to follow' }).fill('https://reading.example')
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  await page.getByRole('group', { name: 'Reading notes', exact: true }).getByRole('button', { name: 'Follow', exact: true }).click()
  await page.reload()
  await page.getByRole('region', { name: 'Your publishers' }).getByRole('link', { name: 'Open Reading notes' }).click()
  await expect(page.getByRole('heading', { name: 'Reading notes', exact: true }).first()).toBeVisible()
  await row(page, MELTING.title).getByRole('heading', { name: MELTING.title }).click()
  await expect(pane(page)).toBeVisible()
  await closeStory(page)
  await expect(row(page, MELTING.title)).toBeVisible()
  expect(new URL(page.url()).pathname).toBe(`/t/${encodeURIComponent('feed:https://reading.example/feed.xml?kind=news&lang=en')}`)
})
