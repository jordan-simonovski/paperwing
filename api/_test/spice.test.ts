import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpiceResponse } from '../../src/lib/spiceTypes.js'
import { call, fakeUpstreams, memoryStore } from './harness.js'

// Gradings run after the answer is sent; here they're collected, so a test can see which started
// and wait for them (against the faked network they fail, which is fine: only starting matters).
const started = vi.hoisted(() => [] as Promise<unknown>[])
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => void started.push(p) }))

const { GET } = await import('../spice.js')

fakeUpstreams()
memoryStore()

const ask = (keys: string[], from: string) => call<SpiceResponse>(GET, `/api/spice?keys=${keys.map((k) => `${k}~500`).join(',')}`, { headers: { 'x-forwarded-for': from } })

describe('spice grades', () => {
  beforeEach(() => {
    process.env.TYPESAFE_API_KEY = 'test'
    started.length = 0
  })
  afterEach(async () => {
    await Promise.allSettled(started)
    delete process.env.TYPESAFE_API_KEY
  })

  // A reader out of gradings for the day starts none, and mustn't hold up the story for everyone else.
  it("a reader who has used up their gradings doesn't stop anyone else's", async () => {
    for (let i = 0; i < 10; i++)
      await ask(
        [1, 2, 3, 4, 5, 6].map((n) => `hn-${i * 6 + n}`),
        '203.0.113.1',
      )
    expect(started).toHaveLength(60)

    const spent = await ask(['hn-1000'], '203.0.113.1')
    expect(spent.body.pending).toEqual([])
    expect(started).toHaveLength(60)

    const other = await ask(['hn-1000'], '203.0.113.2')
    expect(other.body.pending).toEqual(['hn-1000'])
    expect(started).toHaveLength(61)
  })
})
