import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Vercel makes a function of every file under api/ unless the file or a folder above it starts
// with an underscore. Tests and helpers belong in api/_test/ and api/_lib/; anything else under
// api/ is deployed, and counts against the plan's function limit.

const API = join(import.meta.dirname, '..')

function deployed(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('_') || e.name.startsWith('.')) return []
    const path = join(dir, e.name)
    return e.isDirectory() ? deployed(path) : /\.(c|m)?[jt]sx?$/.test(e.name) ? [relative(API, path)] : []
  })
}

describe('what Vercel deploys from api/', () => {
  it('is handlers only: no tests, harnesses or fixtures become public functions', () => {
    for (const file of deployed(API)) expect(file, file).not.toMatch(/\.test\.|harness|fixture/)
  })
  it('stays within the Hobby plan’s twelve functions', () => {
    expect(deployed(API).length).toBeLessThanOrEqual(12)
  })
})

/**
 * Every relative import reachable from a function, with the file it's in. Vercel runs functions as
 * Node ESM, which needs the file named (`./topics.js`): Vite and Vitest find `./topics` either way,
 * so a missing extension passes every other check and then fails every function that loads it.
 */
function relativeImports(entries: string[]): { from: string; spec: string }[] {
  const seen = new Set<string>()
  const found: { from: string; spec: string }[] = []
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    // Type-only imports are erased before anything runs.
    const code = readFileSync(file, 'utf8').replace(/^\s*(import|export)\s+type\s[^;]*?from\s+['"][^'"]+['"]/gm, '')
    for (const m of code.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]|(?:^|\n)\s*import\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      const spec = m[1] ?? m[2] ?? m[3]
      found.push({ from: relative(join(API, '..'), file), spec })
      const target = resolve(dirname(file), spec).replace(/\.js$/, '')
      const next = ['.ts', '.tsx', '/index.ts', ''].map((ext) => target + ext).find((f) => existsSync(f) && /\.tsx?$/.test(f))
      if (next) visit(next)
    }
  }
  for (const entry of entries) visit(join(API, entry))
  return found
}

describe('what Vercel runs from api/', () => {
  it('names the file in every relative import, all the way down: Node ESM finds nothing else', () => {
    const missing = relativeImports(deployed(API)).filter(({ spec }) => !/\.(js|json)$/.test(spec))
    expect(missing).toEqual([])
  })
})
