import { open, type SyncRecord } from '../src/lib/syncCrypto'
import { WEB_WE_LOST, WEB_WE_LOST_THREAD } from './fixtures/upstream'
import { gotoFeed, row } from './support/app'
import { expect, test } from './support/test'

// Sync uploads the library sealed on the device: the server sees opaque ids and ciphertext,
// never what was saved. Passkeys can't be created headless, so this turns sync on with a code,
// which seals with the same keys (src/lib/syncCrypto.ts) as a passkey's.
test('turning on sync uploads the library sealed, with nothing readable in it', async ({ page }) => {
  await gotoFeed(page)
  await row(page, 'The Web We Lost').getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(/^Saved to your queue/)).toBeVisible()

  await page.goto('/settings/library')
  const upload = page.waitForRequest((r) => r.url().endsWith('/api/sync') && r.method() === 'POST')
  await page.getByRole('button', { name: 'Turn on sync with a code' }).click()
  const request = await upload
  await expect(page.getByText('Sync is on. Pair another device with the code or QR below')).toBeVisible()

  const body = request.postData() ?? ''
  const { changes } = JSON.parse(body) as { changes: SyncRecord[] }
  // Every record sealed: an opaque id and ciphertext.
  expect(changes.length).toBeGreaterThan(0)
  for (const change of changes) {
    expect(change.key).toMatch(/^x:[\w-]{32}$/)
    expect(change.data).toMatch(/^v1\.[\w-]+\.[\w-]+$/)
  }
  for (const secret of [WEB_WE_LOST.title, WEB_WE_LOST.url!, 'anildash', 'hn-41000001', WEB_WE_LOST_THREAD.children[0].author!]) {
    expect(body).not.toContain(secret)
  }
  // The code travels in a header, as the way to find this space. With it, and only with it, the
  // records open: the saved story did go up.
  const code = request.headers()['x-sync-code']
  expect(code).toMatch(/^[a-z2-7]{26}$/)
  const opened = await Promise.all(changes.map((c) => open(code, c)))
  const saved = opened.find((r) => r?.key === 's:hn-41000001')
  expect((saved?.data as { story?: { title?: string } } | undefined)?.story?.title).toBe(WEB_WE_LOST.title)
})
