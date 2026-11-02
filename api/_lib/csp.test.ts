import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The Content-Security-Policy in vercel.json allows index.html's one inline script (the theme,
// set before first paint) by its hash. Editing the script without updating the hash would block it.
describe('Content-Security-Policy', () => {
  it("allows index.html's inline script by its current hash", () => {
    const html = readFileSync('index.html', 'utf8')
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { headers: { key: string; value: string }[] }[] }
    const csp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')!.value
    for (const s of scripts) expect(csp).toContain(`'sha256-${createHash('sha256').update(s).digest('base64')}'`)
  })
})
