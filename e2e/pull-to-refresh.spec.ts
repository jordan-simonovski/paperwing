import type { Page } from '@playwright/test'
import { gotoFeed } from './support/app'
import { expect, test } from './support/test'

async function pull(page: Page, distance = 200, cancel = false) {
  const touch = await page.context().newCDPSession(page)
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 300 }] })
  for (let dy = 20; dy <= distance; dy += 20) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y: 300 + dy }] })
  }
  return async () => {
    await touch.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] })
    await touch.detach()
  }
}

test('Pip runs for the whole refresh and then makes room for stories', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Pull to refresh belongs to the window-scrolling mobile layout')
  // Exercise refresh motion after launch; the separate splash covers the app during its hand-off.
  await page.addInitScript(() => sessionStorage.setItem('readout:splashed', '1'))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await gotoFeed(page, 'hn')
  let release!: () => void
  let requests = 0
  const pending = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/topstories.json', async (route) => {
    requests++
    await pending
    await route.fallback()
  })
  try {
    const end = await pull(page)
    await expect(page.getByText('Release to refresh', { exact: true })).toBeVisible()
    await end()
    await expect(page.getByRole('status').filter({ hasText: 'Refreshing feed' })).toHaveText('Refreshing feed')
    await expect(page.getByText('Fetching fresh stories…', { exact: true })).toBeVisible()
    await expect(page.locator('.ptr-pip')).toHaveCSS('animation-name', 'ptr-run')
    await expect(page.locator('.ptr')).toHaveCSS('height', '104px')
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(page.getByText('Fetching fresh stories…', { exact: true })).toBeVisible()
    expect(requests).toBe(1)
    release()
    await expect(page.getByText('Fetching fresh stories…', { exact: true })).toHaveCount(0)
    await expect(page.locator('.ptr')).toHaveCSS('height', '0px')
  } finally {
    release()
  }
})

test('short and cancelled pulls do not request new stories', async ({ page, isMobile, net }) => {
  test.skip(!isMobile)
  await gotoFeed(page, 'hn')
  const count = () => net.calls.filter((c) => c.url.pathname.endsWith('/topstories.json')).length
  const before = count()
  await (
    await pull(page, 60)
  )()
  await expect(page.locator('.ptr')).toHaveCSS('height', '0px')
  await (
    await pull(page, 200, true)
  )()
  await expect(page.locator('.ptr')).toHaveCSS('height', '0px')
  expect(count()).toBe(before)
})

test('reduced motion keeps Pip still while refresh remains usable', async ({ page, isMobile }) => {
  test.skip(!isMobile)
  await gotoFeed(page, 'hn')
  const end = await pull(page)
  await expect(page.getByText('Release to refresh', { exact: true })).toBeVisible()
  await expect(page.locator('.ptr-pip')).toHaveCSS('animation-name', 'none')
  await expect(page.locator('.ptr-pip')).toHaveCSS('transform', 'none')
  await end()
  await expect(page.locator('.ptr')).toHaveCSS('height', '0px')
})

test('going offline releases Pip and leaves cached stories readable', async ({ page, isMobile, context }) => {
  test.skip(!isMobile)
  await gotoFeed(page, 'hn')
  let release!: () => void
  const pending = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/topstories.json', async (route) => {
    await pending
    await route.fallback()
  })
  try {
    await (
      await pull(page)
    )()
    await expect(page.getByText('Fetching fresh stories…', { exact: true })).toBeVisible()
    await context.setOffline(true)
    await expect(page.locator('.ptr')).toBeHidden()
    await expect(page.getByRole('feed').getByRole('article').first()).toBeVisible()
    await context.setOffline(false)
    release()
    await expect(page.locator('.ptr')).toHaveCSS('height', '0px')
  } finally {
    release()
    await context.setOffline(false)
  }
})

test.describe('Motion switched off in the app', () => {
  test.use({ prefs: { pretext: false } })
  test('Pip stays still even when the system allows animation', async ({ page, isMobile }) => {
    test.skip(!isMobile)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await gotoFeed(page, 'hn')
    const end = await pull(page)
    await expect(page.getByText('Release to refresh', { exact: true })).toBeVisible()
    await expect(page.locator('.ptr-pip')).toHaveCSS('transform', 'none')
    await end()
  })
})

test('Pip waits for the last source even when that source fails', async ({ page, isMobile, net }) => {
  test.skip(!isMobile)
  await gotoFeed(page)
  const hnRequests = () => net.calls.filter((c) => c.url.pathname.endsWith('/topstories.json')).length
  const before = hnRequests()
  let release!: () => void
  const pending = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/feed?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('src') !== 'lobsters') return route.fallback()
    await pending
    await route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } })
  })
  try {
    const hnFinished = page.waitForResponse((response) => response.url().includes('hn.algolia.com'))
    await (
      await pull(page)
    )()
    await (await hnFinished).finished()
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    expect(hnRequests()).toBe(before + 1)
    await expect(page.getByText('Fetching fresh stories…', { exact: true })).toBeVisible()
    release()
    await expect(page.getByText('Fetching fresh stories…', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('feed').getByRole('article').first()).toBeVisible()
  } finally {
    release()
  }
})

test('changing channel during refresh clears the scene and allows a new pull', async ({ page, isMobile }) => {
  test.skip(!isMobile)
  await gotoFeed(page, 'hn')
  let release!: () => void
  const pending = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/topstories.json', async (route) => {
    await pending
    await route.fallback()
  })
  try {
    await (
      await pull(page)
    )()
    await expect(page.getByText('Fetching fresh stories…', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await expect(page.locator('.ptr')).toHaveCSS('height', '0px')
    release()
    await page.getByRole('button', { name: 'Top', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Top', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('feed').getByRole('article').first()).toBeVisible()
    const end = await pull(page)
    await expect(page.getByText('Release to refresh', { exact: true })).toBeVisible()
    await end()
    await expect(page.locator('.ptr')).toHaveCSS('height', '0px')
  } finally {
    release()
  }
})
