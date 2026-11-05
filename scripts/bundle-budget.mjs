import { readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

// What a first visit downloads, gzipped, against a budget. Run after `npm run build`.
// The entry is the script index.html loads; its static imports (modulepreloads) load with it.
// Raise a budget only on purpose, in the same change that needs it, and say why in the PR.
const BUDGET_KB = {
  // ~276.8 KB once marked and DOMPurify left for the reader and composer; held there.
  entry: 280, // index.html's script and everything it statically imports
  css: 25, // the wordmark's face is inlined (~5 KB) in place of a 121 KB font file
  totalJs: 575, // ~573.6 KB: splitting marked and DOMPurify out costs ~1.6 KB of chunk overhead; every chunk is precached
}

const dist = process.argv[2] ?? 'dist'
const html = readFileSync(`${dist}/index.html`, 'utf8')
const gz = (file) => gzipSync(readFileSync(`${dist}/${file}`)).length / 1024
const entryFiles = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1])
const cssFiles = [...html.matchAll(/href="\/(assets\/[^"]+\.css)"/g)].map((m) => m[1])
const allJs = readdirSync(`${dist}/assets`)
  .filter((f) => f.endsWith('.js'))
  .map((f) => `assets/${f}`)

// A changed base path or asset naming would match nothing and read as 0 KB: that's a broken gate, not a pass.
if (!entryFiles.length || !cssFiles.length || !allJs.length) {
  console.error(
    `Bundle budget: nothing to measure (entry ${entryFiles.length}, css ${cssFiles.length}, js ${allJs.length} files). Update the patterns in scripts/bundle-budget.mjs to match ${dist}/index.html.`,
  )
  process.exit(1)
}

const sum = (files) => files.reduce((n, f) => n + gz(f), 0)
const actual = { entry: sum(entryFiles), css: sum(cssFiles), totalJs: sum(allJs) }

let over = false
for (const [name, limit] of Object.entries(BUDGET_KB)) {
  const kb = actual[name]
  const ok = kb <= limit
  over ||= !ok
  console.log(`${ok ? 'ok  ' : 'OVER'} ${name.padEnd(8)} ${kb.toFixed(1).padStart(7)} KB gzip (budget ${limit} KB)`)
}
if (over) {
  console.error('\nBundle budget exceeded. Lazy-load what the first screen doesn’t need (see the codebase-health skill), or raise the budget on purpose.')
  process.exit(1)
}
