import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// A gate that measures nothing must fail, not print "ok".
const run = (dist) => spawnSync(process.execPath, ['scripts/bundle-budget.mjs', dist], { encoding: 'utf8' })
const build = (html, assets = {}) => {
  const dist = mkdtempSync(join(tmpdir(), 'budget-'))
  mkdirSync(join(dist, 'assets'))
  writeFileSync(join(dist, 'index.html'), html)
  for (const [name, body] of Object.entries(assets)) writeFileSync(join(dist, 'assets', name), body)
  return dist
}

describe('the bundle budget', () => {
  it('passes a small build', () => {
    const dist = build('<script type="module" src="/assets/index-a.js"></script><link rel="stylesheet" href="/assets/index-a.css">', { 'index-a.js': 'x', 'index-a.css': 'y' })
    expect(run(dist).status).toBe(0)
  })

  it('fails when index.html no longer names the entry or stylesheet it measures', () => {
    const dist = build('<script type="module" src="/base/assets/index-a.js"></script>', { 'index-a.js': 'x' })
    const result = run(dist)
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/nothing to measure/i)
  })
})
