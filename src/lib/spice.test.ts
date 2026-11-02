import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpiceStore, wantSpice } from './spice'
import type { SpiceGrade, SpiceResponse } from './spiceTypes'

const grade: SpiceGrade = { level: 2, heat: 2, confidence: 0.9, split: 0.6, pushback: 0.6, hostile: 0, pileOn: 0, comments: 300, at: 0, v: 1 }
const answer = (key: string): SpiceResponse => ({ enabled: true, grades: { [key]: grade }, pending: [] })

describe('spice grades on the device', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  // A failed ask (the server busy, a moment offline) must not leave the story without chillies for the rest of the visit.
  it.each([
    ['the server fails', 'hn-1', () => Promise.resolve(new Response('busy', { status: 503 }))],
    ['the device is offline', 'hn-2', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('asks again a little later when %s', async (_, key, failure) => {
    const story = { key, source: 'hn' as const, comments: 300 }
    const fetch = vi.fn<typeof globalThis.fetch>(failure)
    vi.stubGlobal('fetch', fetch)
    wantSpice(story)
    await vi.advanceTimersByTimeAsync(100)
    expect(fetch).toHaveBeenCalledTimes(1)

    // Not straight away: a struggling server doesn't hear from every row on every render.
    fetch.mockImplementation(async () => Response.json(answer(story.key)))
    wantSpice(story)
    await vi.advanceTimersByTimeAsync(100)
    expect(fetch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    // Rows ask on every render; a render after the pause asks for real.
    wantSpice(story)
    await vi.advanceTimersByTimeAsync(100)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(useSpiceStore.getState().grades[story.key]).toEqual(grade)
  })
})
