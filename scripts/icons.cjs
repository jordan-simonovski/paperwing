// Renders PaperWing's app icons from Pip's compact mark (design/readout-mascot-icon.svg): the owl's
// head on an ink tile. Writes public/icon.svg and the PNGs. Run with `npm run icons` after
// changing the design file.
const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')

const INK = '#23221f'
// Pip's red is the app's signal red (styles.css --signal, oklch(0.55 0.215 27)), one red across
// the brand.
const SIGNAL = '#d2161e'
const source = fs.readFileSync(path.resolve(__dirname, '../design/readout-mascot-icon.svg'), 'utf8')
// The mark's shapes, without its own <svg>, title and description.
const art = source
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(/<title[\s\S]*?<\/title>|<desc[\s\S]*?<\/desc>/g, '')
  .trim()
  .replace(/#d62f35/gi, SIGNAL)
const viewBox = source.match(/viewBox="([^"]+)"/)[1]

/**
 * The icon as SVG: a tile, and the head inset so it breathes. Maskable icons (Android) have their
 * edges cropped, so they're inset more; full-bleed icons (iOS rounds them itself) a little.
 */
function icon(size, maskable, inset = maskable ? 0.2 : 0.1) {
  const s = 512
  const o = s * inset
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${maskable ? 0 : 116}" fill="${INK}"/>
  <svg x="${o}" y="${o + s * 0.01}" width="${s - o * 2}" height="${s - o * 2}" viewBox="${viewBox}">${art}</svg>
</svg>`
}

// File, size, full bleed (no rounded corners, an opaque tile), inset.
const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true, 0.12],
  ['favicon-32.png', 32, false, 0.04],
]

;(async () => {
  fs.writeFileSync(path.resolve(__dirname, '../public/icon.svg'), icon(512, false) + '\n')
  console.log('wrote icon.svg')
  const browser = await chromium.launch()
  const page = await browser.newPage()
  for (const [file, size, maskable, inset] of targets) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${icon(size, maskable, inset)}</body>`)
    await page
      .locator('svg')
      .first()
      .screenshot({ path: path.resolve(__dirname, '../public', file), omitBackground: !maskable })
    console.log('wrote', file)
  }
  await browser.close()
})()
