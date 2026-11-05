import { channelId } from '../src/lib/channelId'
import { MELTING } from './fixtures/upstream'
import { gotoFeed, row } from './support/app'
import { expect, test } from './support/test'

test('For you has no share button because its feed belongs to the reader', async ({ page }) => {
  await gotoFeed(page)
  await expect(page.getByRole('heading', { name: 'For you', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Share For you', exact: true })).toHaveCount(0)
})

test('a topic has a share link that preserves its view and can be copied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => sessionStorage.setItem('copied-link', text) } })
  })
  await page.goto('/t/space')
  await expect(page.getByRole('heading', { name: 'Space', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Latest', exact: true }).click()
  await page.getByRole('button', { name: 'Share Space', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Share Space' })
  const link = await sheet.getByRole('textbox', { name: 'Link' }).inputValue()
  expect(new URL(link).pathname).toBe('/t/space')
  expect(new URL(link).searchParams.get('sort')).toBe('new')
  await sheet.getByRole('button', { name: 'Copy link' }).click()
  await expect(page.getByText('Link copied', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('copied-link'))).toBe(link)
  await page.goto(link)
  await expect(page.getByRole('button', { name: 'Latest', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test.describe('a feed the recipient has not added', () => {
  const uri = 'at://did:plc:feedcreatorexampleabcdef/app.bsky.feed.generator/science'
  const post = {
    uri: 'at://did:plc:feedcreatorexampleabcdef/app.bsky.feed.post/3m2scienceaaa',
    cid: 'bafytest',
    author: { did: 'did:plc:feedcreatorexampleabcdef', handle: 'science.example' },
    record: { text: 'A new view of the stars', createdAt: '2026-10-30T10:00:00Z' },
    indexedAt: '2026-10-30T10:00:00Z',
  }
  test.use({ prefs: { bskyFeeds: [], customFeeds: [] }, stubs: { bluesky: { [uri]: [{ post }] }, feeds: { standard: [MELTING] } } })

  test('a Bluesky link opens without adding it and can be shared again', async ({ page }) => {
    const id = channelId({ kind: 'bskyFeed', uri })
    await gotoFeed(page, id)
    await expect(row(page, 'A new view of the stars')).toBeVisible()
    await page.getByRole('button', { name: 'Share Bluesky feed', exact: true }).click()
    const link = await page.getByRole('textbox', { name: 'Link' }).inputValue()
    expect(new URL(link).pathname).toBe(`/t/${id}`)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('readout:prefs')!).state.bskyFeeds)).toEqual([])
  })

  test('a native publication keeps its format in the shared link', async ({ page, net }) => {
    const id = 'feed:https://writing.example'
    await page.goto(`/t/${encodeURIComponent(id)}?format=standard`)
    await expect(row(page, MELTING.title)).toBeVisible()
    expect(net.calls.some((c) => c.url.searchParams.get('src') === 'standard' && c.url.searchParams.get('url') === 'https://writing.example')).toBe(true)
    await page.getByRole('button', { name: 'Share writing.example', exact: true }).click()
    const link = await page.getByRole('textbox', { name: 'Link' }).inputValue()
    expect(new URL(link).searchParams.get('format')).toBe('standard')
  })
})

test('an unpublished mix explains how to get a public share link', async ({ page }) => {
  await page.addInitScript(() => {
    const prefs = JSON.parse(localStorage.getItem('readout:prefs')!)
    prefs.state.mixes = [{ id: '3m2abcdefghij', name: 'Weekend reading', sources: [{ kind: 'topic', id: 'space' }], updatedAt: 1 }]
    localStorage.setItem('readout:prefs', JSON.stringify(prefs))
  })
  await page.goto('/t/mix:3m2abcdefghij')
  await expect(page.getByRole('heading', { name: 'Weekend reading', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Share Weekend reading', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Share Weekend reading' })
  await expect(sheet.getByText('Publish this mix to give it a link other people can open.')).toBeVisible()
  await expect(sheet.getByRole('link', { name: 'Open mix editor' })).toHaveAttribute('href', '/mixes/3m2abcdefghij')
  await expect(sheet.getByRole('textbox', { name: 'Link' })).toHaveCount(0)
})

test('a shared interest opens without following it and can then be followed', async ({ page }) => {
  await page.goto(`/t/${encodeURIComponent('q:c++ / rust')}`)
  await expect(page.getByRole('heading', { name: 'c++ / rust', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Share c++ / rust', exact: true }).click()
  const link = await page.getByRole('textbox', { name: 'Link' }).inputValue()
  expect(decodeURIComponent(new URL(link).pathname.slice(3))).toBe('q:c++ / rust')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Follow', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Following', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('readout:prefs')!).state.interests)).toContainEqual({ id: 'q:c++ / rust', label: 'c++ / rust', query: 'c++ / rust' })
})
