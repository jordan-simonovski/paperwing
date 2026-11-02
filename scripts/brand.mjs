// Renders PaperWing's brand artwork from the dev-only /brand page (src/routes/BrandPage.tsx).
// Run the dev server (npm run dev), then: node scripts/brand.mjs [http://localhost:5173]
import { createRequire } from 'node:module'

// Playwright may be installed globally rather than in the project: require finds it either way.
const { chromium } = createRequire(import.meta.url)('playwright')

const base = process.argv[2] ?? 'http://localhost:5173'
const assets = [
  { asset: 'og', out: 'public/og.png', w: 1200, h: 630 },
  { asset: 'avatar', out: 'brand/avatar.png', w: 1000, h: 1000 },
  { asset: 'avatar-light', out: 'brand/avatar-light.png', w: 1000, h: 1000 },
  { asset: 'banner', out: 'brand/banner.png', w: 3000, h: 1000 },
]
const browser = await chromium.launch()
for (const a of assets) {
  const page = await browser.newPage({ viewport: { width: a.w, height: a.h }, deviceScaleFactor: 1 })
  // No seasonal hat on the brand, and no splash.
  await page.addInitScript(() => {
    sessionStorage.setItem('readout:splashed', '1')
    localStorage.setItem('readout:prefs', JSON.stringify({ state: { welcomed: true, seasonal: false, theme: 'light' }, version: 5 }))
  })
  await page.goto(`${base}/brand?asset=${a.asset}`)
  await page.waitForSelector('#asset svg')
  await page.evaluate(() => document.fonts.ready)
  await page.locator('#asset').screenshot({ path: a.out })
  console.log('wrote', a.out)
  await page.close()
}
await browser.close()
