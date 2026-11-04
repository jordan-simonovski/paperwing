import { channelList, row } from './support/app'
import { expect, test } from './support/test'
import { MELTING } from './fixtures/upstream'

const climbing = {
  ...MELTING,
  key: 'rss-first-bouldering',
  sourceLabel: 'Climbing Skills',
  title: 'Your first bouldering session: footwork and confidence',
  url: 'https://www.climbing.com/skills/first-session/',
}
test.use({ prefs: { followed: ['sport'] }, stubs: { feeds: { 'rss:Climbing Skills': [climbing] } } })

test('find a beginner sport, follow it and open its reading', async ({ page }) => {
  await page.goto('/explore/topics')
  await page.getByRole('searchbox', { name: 'Find a topic' }).fill('bouldering')
  await expect(page.getByRole('status')).toHaveText('1 topic found')
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Climbing & bouldering' }) })
  await card.getByRole('button', { name: 'Follow Climbing & bouldering' }).click()
  await card.getByRole('link', { name: 'Climbing & bouldering', exact: true }).click()
  await expect(page).toHaveURL(/\/t\/climbing$/)
  await expect(page.getByRole('navigation', { name: 'Getting started' }).getByRole('link', { name: 'Bouldering basics (REI)' })).toBeVisible()
  await expect(row(page, climbing.title)).toBeVisible()
  await page.reload()
  const channels = await channelList(page)
  await expect(channels.getByRole('link', { name: 'Climbing & bouldering', exact: true })).toBeVisible()
})

test('regional searches show individual sports and clear cleanly', async ({ page }) => {
  await page.goto('/explore/topics')
  const search = page.getByRole('searchbox', { name: 'Find a topic' })
  await search.fill('Aussie sports')
  await expect(page.getByRole('heading', { name: 'NRL & rugby league' })).toBeAttached()
  await expect(page.getByRole('heading', { name: 'AFL & Aussie rules' })).toBeAttached()
  await expect(page.getByRole('heading', { name: 'Intelligence', exact: true })).toHaveCount(0)
  await search.fill('American sports')
  await expect(page.getByRole('heading', { name: 'American football', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Baseball', exact: true })).toBeAttached()
  await expect(page.getByRole('heading', { name: 'Ice hockey', exact: true })).toBeAttached()
  await search.fill('no-such-sport-zzzz')
  await expect(page.getByRole('status')).toContainText('No matching topics')
  await search.clear()
  await expect(page.getByRole('heading', { name: 'Sport', level: 2 })).toBeAttached()
})
