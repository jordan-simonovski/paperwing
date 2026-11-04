import { expect, test } from './support/test'

test('topic artwork is a static PNG and people still open the topic in the app', async ({ page, request }) => {
  const images: Buffer[] = []
  for (const id of ['baseball', 'climbing', 'ai']) {
    const response = await request.get(`/og/topics/${id}.png`)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('image/png')
    const png = await response.body()
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
    images.push(png)
  }
  expect(images[0].equals(images[1])).toBe(false)
  expect(images[1].equals(images[2])).toBe(false)
  await page.goto('/t/baseball')
  await expect(page.getByRole('heading', { name: 'Baseball', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Share Baseball', exact: true })).toBeVisible()
})
