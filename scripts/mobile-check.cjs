// Layout smoke test on phone viewports: the desktop rail must be hidden, the bottom nav shown,
// content visible in the first screen, and no horizontal scroll. Desktop Chromium reports
// zero safe-area insets, so a notched iPhone is simulated by rewriting env() in the loaded CSS.
// Usage: npm run dev, then `npm run check:mobile` (BASE=https://your.app to test a deployment).
const { chromium, devices } = require('playwright')
const os = require('node:os')
const BASE = process.env.BASE ?? 'http://localhost:5173'
const OUT = process.env.OUT ?? os.tmpdir()
;(async () => {
  const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {})
  let failed = false
  for (const [name, dev, dark] of [
    ['iphone-light', devices['iPhone 14'], false],
    ['iphone-dark', devices['iPhone 14'], true],
    ['pixel', devices['Pixel 7'], false],
  ]) {
    const ctx = await browser.newContext({ ...dev })
    if (dark) await ctx.addInitScript(() => localStorage.setItem('readout:prefs', JSON.stringify({ state: { theme: 'dark' }, version: 1 })))
    const page = await ctx.newPage()
    for (const path of ['/t/for-you', '/topics', '/saved', '/settings']) {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(path === '/t/for-you' ? 6000 : 1000)
      const r = await page.evaluate(() => ({
        rail: getComputedStyle(document.querySelector('.rail')).display,
        bottomNav: getComputedStyle(document.querySelector('.bottom-nav')).display,
        firstContentTop: Math.round(document.querySelector('.row .row-title, h1')?.getBoundingClientRect().top ?? -1),
        overflow: document.documentElement.scrollWidth - innerWidth,
      }))
      if (path === '/t/for-you') {
        // Simulate an installed iPhone app: 47px status bar on top, 34px home indicator below.
        await page.evaluate(async () => {
          const notch = (css) => css.replaceAll('env(safe-area-inset-top)', '47px').replaceAll('env(safe-area-inset-bottom)', '34px')
          for (const s of document.querySelectorAll('style')) s.textContent = notch(s.textContent)
          for (const l of [...document.querySelectorAll('link[rel=stylesheet]')]) {
            const style = document.createElement('style')
            style.textContent = notch(await (await fetch(l.href)).text())
            l.replaceWith(style)
          }
        })
        await page.waitForTimeout(200)
        r.notch = await page.evaluate(() => ({
          logoTop: Math.round(document.querySelector('.mobile-bar a').getBoundingClientRect().top),
          navLabelBottom: Math.round(document.querySelector('.bottom-nav a').getBoundingClientRect().bottom),
        }))
      }
      const notchOk = !r.notch || (r.notch.logoTop >= 47 && r.notch.navLabelBottom <= dev.viewport.height - 34)
      const ok = notchOk && r.rail === 'none' && r.bottomNav === 'grid' && r.firstContentTop > 0 && r.firstContentTop < dev.viewport.height && r.overflow === 0
      if (!ok) failed = true
      console.log(ok ? 'PASS' : 'FAIL', name, path, JSON.stringify(r))
      if (path === '/t/for-you') await page.screenshot({ path: `${OUT}/mobile-${name}.png` })
    }
    // Search is a tab on phones: the nav must stay visible and tappable, topics match as you type.
    let searchOk = false
    let searchDetail = ''
    try {
      await page.goto(BASE + '/t/for-you', { waitUntil: 'domcontentloaded' })
      await page.locator('.bottom-nav a[href="/search"]').tap({ timeout: 10000 })
      await page.waitForURL(/\/search/, { timeout: 5000 })
      const navOnTop = () =>
        page.evaluate(() => {
          const nav = document.querySelector('.bottom-nav')
          const r = nav.getBoundingClientRect()
          return nav.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
        })
      const input = page.locator('input[type="search"]')
      await input.tap()
      await input.fill('tracing')
      await page.waitForSelector('.field.topic', { timeout: 5000 })
      const matched = await page.locator('.field.topic').first().innerText()
      await input.press('Enter')
      await page.waitForSelector('.row .row-title', { timeout: 30000 })
      searchOk = (await navOnTop()) && /Observability/.test(matched) && (await page.locator('.bottom-nav a.active[href="/search"]').count()) === 1
      if (!searchOk) searchDetail = `nav on top: ${await navOnTop()}, matched: ${matched.split('\n')[0]}`
      await page.screenshot({ path: `${OUT}/mobile-search-${name}.png` })
    } catch (e) {
      searchDetail = e.message.split('\n')[0]
    }
    if (!searchOk) failed = true
    console.log(searchOk ? 'PASS' : 'FAIL', name, 'search tab keeps the nav and matches topics', searchDetail)

    // Theme switches with the reader open have crashed before (a conditional hook), so flip it both ways.
    let themeOk = false
    let detail = ''
    try {
      await page.goto(BASE + '/t/for-you', { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.row .row-title', { timeout: 30000 })
      const toggle = page.locator('.mobile-bar button[aria-label="Toggle dark mode"]')
      await toggle.tap({ timeout: 5000 })
      await toggle.tap({ timeout: 5000 })
      await page.locator('.row .row-title a').first().tap({ timeout: 5000 })
      await page.waitForSelector('.pane-col.open h1', { timeout: 15000 })
      await page.keyboard.press('t')
      await page.keyboard.press('t')
      await page.waitForTimeout(300)
      themeOk = (await page.locator('.pane-col.open h1').count()) === 1
    } catch (e) {
      detail = e.message.split('\n')[0]
    }
    const crashed = await page.getByText(/PaperWing hit an error|Unexpected Application Error/).count()
    if (crashed) (themeOk = false), (detail = 'app crashed: ' + (await page.locator('body').innerText()).split('\n').slice(0, 3).join(' / '))
    if (!themeOk) failed = true
    console.log(themeOk ? 'PASS' : 'FAIL', name, 'theme toggle with reader open', detail)
    await ctx.close()
  }
  await browser.close()
  process.exit(failed ? 1 : 0)
})()
