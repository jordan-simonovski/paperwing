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

/** Relative module specifiers a file loads at run time: imports, re-exports, side-effect imports and import(). */
export function runtimeSpecifiers(code: string): string[] {
  // Type-only imports and re-exports are erased before anything runs. Matched clause by clause, so a
  // type alias (`export type A = 'x'`, no semicolons here) can never swallow the import after it.
  const values = code.replace(/^\s*(?:import|export)\s+type\s+(?:\*(?:\s+as\s+\w+)?|\{[^}]*\}|\w+)\s+from\s+['"][^'"]+['"]/gm, '')
  const found: string[] = []
  for (const m of values.matchAll(/^\s*(?:import|export)\s[^'"]*?\bfrom\s+['"](\.[^'"]+)['"]|^\s*import\s+['"](\.[^'"]+)['"]|\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/gm)) found.push(m[1] ?? m[2] ?? m[3])
  return found
}

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
    for (const spec of runtimeSpecifiers(readFileSync(file, 'utf8'))) {
      found.push({ from: relative(join(API, '..'), file), spec })
      const target = resolve(dirname(file), spec).replace(/\.js$/, '')
      const next = ['.ts', '.tsx', '/index.ts'].map((ext) => target + ext).find((f) => existsSync(f))
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

  it('reads every way a module is loaded, and skips only what TypeScript erases', () => {
    const code = [
      "import { a } from './a'",
      "import type { T } from './types'",
      "import type * as All from './all'",
      "export type Kind = 'x' | 'y'",
      "export { b } from './b'",
      "export * from './c'",
      "import './side'",
      'import {',
      '  d,',
      '  e,',
      "} from './de'",
      "const f = await import('./f')",
      "import pkg from 'some-package'",
    ].join('\n')
    expect(runtimeSpecifiers(code)).toEqual(['./a', './b', './c', './side', './de', './f'])
  })
})
