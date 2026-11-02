import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
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
