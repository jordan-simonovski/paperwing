import { describe, expect, it } from 'vitest'
import { fitWithin, shrink, MAX_IMAGE_BYTES, MAX_IMAGE_SIDE } from './images'

describe('preparing a picture for Bluesky', () => {
  it('scales the longer side down to the limit, keeping its shape; a small one stays as it is', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: MAX_IMAGE_SIDE, height: 1500 })
    expect(fitWithin(1000, 3000)).toEqual({ width: 667, height: MAX_IMAGE_SIDE })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('tries lower quality, then smaller, until it fits under Bluesky’s limit', async () => {
    const tried: [number, number][] = []
    // A pretend encoder: bytes grow with quality and area.
    const encode = async (scale: number, quality: number) => {
      tried.push([scale, quality])
      return new Blob([new Uint8Array(Math.round(3_000_000 * quality * scale * scale))])
    }
    const out = await shrink(encode)
    expect(out.size).toBeLessThanOrEqual(MAX_IMAGE_BYTES)
    expect(tried[0]).toEqual([1, 0.9])
    // Never smaller than it had to be: the try before the last was still too big.
    expect(tried.length).toBeGreaterThan(1)
  })

  it('gives up on a picture that can’t be made small enough', async () => {
    await expect(shrink(async () => new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)]))).rejects.toThrow(/too big/)
  })
})
