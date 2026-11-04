import { pane, row } from './support/app'
import { expect, test } from './support/test'
import { channelId } from '../src/lib/channelId'

const did = 'did:plc:feedcreatorexampleabcdef'
const uri = `at://${did}/app.bsky.feed.generator/photos`
const post = {
  uri: `at://${did}/app.bsky.feed.post/3m2photosaaa`,
  cid: 'bafytest',
  author: { did, handle: 'photos.example', displayName: 'Field notes' },
  record: { text: 'A little album from the weekend', createdAt: '2026-10-30T10:00:00Z' },
  indexedAt: '2026-10-30T10:00:00Z',
  likeCount: 10,
  replyCount: 0,
  embed: {
    $type: 'app.bsky.embed.images#view',
    images: ['Pip in the morning', 'Pip at midday', 'Pip in the evening'].map((alt, index) => ({
      thumb: '/icon-512.png',
      fullsize: `/icon-512.png?full=${index}`,
      alt,
      aspectRatio: { width: 1, height: 1 },
    })),
  },
}
test.use({
  prefs: { bskyFeeds: [{ uri, name: 'Photos' }] },
  stubs: { bluesky: { [uri]: [{ post }] }, blueskyThreads: { [post.uri]: { thread: { post, replies: [] } } } },
})

test.beforeEach(async ({ page }) => {
  await page.goto(`/t/${channelId({ kind: 'bskyFeed', uri })}`)
  await row(page, post.record.text).getByRole('heading', { name: post.record.text }).click()
  await expect(pane(page)).toBeVisible()
})

test('open the selected image, browse, and return to the same story', async ({ page }) => {
  const opener = pane(page).getByRole('link', { name: 'Open image 2 of 3: Pip at midday' })
  const url = page.url()
  await opener.click()
  const viewer = page.getByRole('dialog', { name: 'Image viewer' })
  await expect(viewer.getByRole('status')).toHaveText('2 of 3')
  await expect(viewer.getByRole('img', { name: 'Pip at midday' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(viewer.getByRole('status')).toHaveText('3 of 3')
  await expect(viewer.getByRole('button', { name: 'Next image' })).toHaveAttribute('aria-disabled', 'true')
  await viewer.getByRole('button', { name: 'Previous image' }).click()
  await page.keyboard.press('x')
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(opener).toBeFocused()
  await expect(page).toHaveURL(url)
  await expect(pane(page).getByRole('heading', { name: post.record.text, level: 1 })).toBeVisible()
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
})

test('swipe left and right without changing images on vertical, short, or cancelled gestures', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch gestures on the phone')
  await pane(page)
    .getByRole('link', { name: /Open image 1 of 3/ })
    .click()
  const viewer = page.getByRole('dialog', { name: 'Image viewer' })
  const image = viewer.getByRole('img', { name: 'Pip in the morning' })
  await expect(image).toBeVisible()
  const box = (await image.boundingBox())!
  const y = box.y + box.height / 2
  const touch = await page.context().newCDPSession(page)
  const swipe = async (from: number, to: number, dy = 0, cancel = false) => {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y }] })
    for (let step = 1; step <= 5; step++) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + ((to - from) * step) / 5, y: y + (dy * step) / 5 }] })
    }
    await touch.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] })
  }
  await swipe(280, 100)
  await expect(viewer.getByRole('status')).toHaveText('2 of 3')
  await swipe(100, 280)
  await expect(viewer.getByRole('status')).toHaveText('1 of 3')
  await swipe(100, 280)
  await expect(viewer.getByRole('status')).toHaveText('1 of 3')
  await swipe(210, 190)
  await swipe(210, 180, 100)
  await swipe(280, 100, 0, true)
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 280, y }] })
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: 280, y, id: 0 },
      { x: 180, y, id: 1 },
    ],
  })
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: 180, y, id: 0 },
      { x: 80, y, id: 1 },
    ],
  })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(viewer.getByRole('status')).toHaveText('1 of 3')
  await viewer.getByRole('button', { name: 'Close image viewer' }).click()
  await expect(pane(page).getByRole('heading', { name: post.record.text, level: 1 })).toBeVisible()
  await touch.detach()
})

test('retry a failed full-size image without closing the album', async ({ page }) => {
  let unavailable = true
  await page.route('**/icon-512.png?full=1', (route) => (unavailable ? route.fulfill({ status: 503, body: '' }) : route.fallback()))
  await pane(page)
    .getByRole('link', { name: /Open image 2 of 3/ })
    .click()
  const viewer = page.getByRole('dialog', { name: 'Image viewer' })
  await expect(viewer.getByText('This image couldn’t load.')).toBeVisible()
  await expect(viewer.getByRole('status')).toHaveText('2 of 3')
  unavailable = false
  await viewer.getByRole('button', { name: 'Try again' }).click()
  await expect(viewer.getByRole('img', { name: 'Pip at midday' })).toBeVisible()
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true)
  await page.keyboard.press('ArrowRight')
  await expect(viewer.getByRole('status')).toHaveText('3 of 3')
})

test('zoom and pan an image on desktop, then reset when browsing', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Phones use pinch gestures')
  await pane(page)
    .getByRole('link', { name: /Open image 1 of 3/ })
    .click()
  const viewer = page.getByRole('dialog', { name: 'Image viewer' })
  const image = viewer.getByRole('img')
  await expect(viewer.getByRole('button', { name: 'Zoom in' })).toHaveAttribute('aria-disabled', 'false')
  await viewer.getByRole('button', { name: 'Zoom in' }).click()
  await expect(viewer.getByText('150%')).toBeVisible()
  const before = await image.getAttribute('style')
  const box = (await image.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 60, { steps: 5 })
  await page.mouse.up()
  expect(await image.getAttribute('style')).not.toBe(before)
  await expect(viewer.getByRole('status')).toHaveText('1 of 3')
  await viewer.getByRole('button', { name: 'Reset zoom' }).click()
  await expect(viewer.getByText('100%')).toBeVisible()
  await viewer.getByRole('button', { name: 'Zoom in' }).click()
  await page.keyboard.press('ArrowRight')
  await expect(viewer.getByText('100%')).toBeVisible()
  await expect(viewer.getByRole('status')).toHaveText('2 of 3')
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true)
})

test('pinch zooms only the image and allows panning without switching slides', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch gestures on the phone')
  await pane(page)
    .getByRole('link', { name: /Open image 1 of 3/ })
    .click()
  const viewer = page.getByRole('dialog', { name: 'Image viewer' })
  const image = viewer.getByRole('img')
  await expect(image).toBeVisible()
  const close = viewer.getByRole('button', { name: 'Close image viewer' })
  const toolbar = await close.boundingBox()
  const box = (await image.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const touch = await page.context().newCDPSession(page)
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: x - 50, y, id: 0 },
      { x: x + 50, y, id: 1 },
    ],
  })
  for (let step = 1; step <= 5; step++) {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: x - 50 - step * 10, y, id: 0 },
        { x: x + 50 + step * 10, y, id: 1 },
      ],
    })
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: x + 100, y, id: 1 }] })
  await expect(image).toHaveCSS('transform', /matrix\(2,/)
  const before = await image.getAttribute('style')
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 40, y, id: 0 }] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  expect(await image.getAttribute('style')).not.toBe(before)
  await expect(viewer.getByRole('status')).toHaveText('1 of 3')
  expect(await close.boundingBox()).toEqual(toolbar)
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1)
  await viewer.getByRole('button', { name: 'Next image' }).click()
  await expect(viewer.getByRole('img')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  await touch.detach()
})

test('download the selected original image as a file', async ({ page }) => {
  await pane(page)
    .getByRole('link', { name: /Open image 2 of 3/ })
    .click()
  const viewer = page.getByRole('dialog', { name: 'Image viewer' })
  const downloading = page.waitForEvent('download')
  const original = page.waitForRequest((request) => request.url().endsWith('?full=1') && request.resourceType() === 'fetch')
  await viewer.getByRole('button', { name: 'Download image' }).click()
  await original
  const download = await downloading
  expect(download.suggestedFilename()).toBe('paperwing-image-2.png')
  expect(await download.failure()).toBeNull()
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(chunk)
  expect(Buffer.concat(chunks).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  await expect(viewer.getByRole('status')).toHaveText('2 of 3')
})

test('a blocked image download reports failure and can be retried', async ({ page }) => {
  let blocked = true
  await page.route('**/icon-512.png?full=0', (route) => (blocked && route.request().resourceType() === 'fetch' ? route.abort() : route.fallback()))
  await pane(page)
    .getByRole('link', { name: /Open image 1 of 3/ })
    .click()
  const viewer = page.getByRole('dialog', { name: 'Image viewer' })
  await viewer.getByRole('button', { name: 'Download image' }).click()
  await expect(viewer.getByRole('alert')).toContainText('Couldn’t download here')
  blocked = false
  const downloading = page.waitForEvent('download')
  await viewer.getByRole('button', { name: 'Download image' }).click()
  await downloading
  await expect(viewer.getByRole('alert')).toHaveCount(0)
})

test('requests opaque iPhone status chrome while retaining safe-area spacing', async ({ page }) => {
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'default')
  await pane(page)
    .getByRole('link', { name: /Open image 1 of 3/ })
    .click()
  const viewer = page.getByRole('dialog', { name: 'Image viewer' })
  await expect(viewer).toHaveCSS('padding-top', '12px')
  expect((await viewer.getByRole('button', { name: 'Close image viewer' }).boundingBox())!.y).toBeGreaterThanOrEqual(12)
})

for (const action of ['browse', 'close'] as const) {
  test(`a pending download is cancelled when you ${action}`, async ({ page }) => {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/icon-512.png?full=0', async (route) => {
      if (route.request().resourceType() !== 'fetch') return route.fallback()
      await held
      await route.fulfill({ status: 503, body: '' }).catch(() => {})
    })
    await pane(page)
      .getByRole('link', { name: /Open image 1 of 3/ })
      .click()
    const viewer = page.getByRole('dialog', { name: 'Image viewer' })
    const downloads: string[] = []
    page.on('download', (download) => downloads.push(download.suggestedFilename()))
    const requested = page.waitForRequest((request) => request.url().endsWith('?full=0') && request.resourceType() === 'fetch')
    await viewer.getByRole('button', { name: 'Download image' }).click()
    const request = await requested
    await expect(viewer.getByRole('button', { name: 'Download image' })).toHaveAttribute('aria-busy', 'true')
    const cancelled = page.waitForEvent('requestfailed', { predicate: (failed) => failed === request })
    await viewer.getByRole('button', { name: action === 'browse' ? 'Next image' : 'Close image viewer' }).click()
    await cancelled
    release()
    if (action === 'close')
      await pane(page)
        .getByRole('link', { name: /Open image 2 of 3/ })
        .click()
    await expect(viewer.getByRole('alert')).toHaveCount(0)
    const downloading = page.waitForEvent('download')
    await viewer.getByRole('button', { name: 'Download image' }).click()
    expect((await downloading).suggestedFilename()).toBe('paperwing-image-2.png')
    expect(downloads).toEqual(['paperwing-image-2.png'])
    await expect(viewer.getByRole('alert')).toHaveCount(0)
  })
}
