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
