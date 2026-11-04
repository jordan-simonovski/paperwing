import { afterEach, describe, expect, it, vi } from 'vitest'
import { imageFile } from './imageDownload'

afterEach(() => vi.unstubAllGlobals())
describe('image downloads', () => {
  it('downloads the original bytes without credentials and chooses a safe extension', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }))
    vi.stubGlobal('fetch', fetch)
    const signal = new AbortController().signal
    const file = await imageFile('https://cdn.example/photo', 2, signal)
    expect(file.name).toBe('paperwing-image-2.png')
    expect(await file.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer)
    expect(fetch).toHaveBeenCalledWith('https://cdn.example/photo', { credentials: 'omit', signal })
  })
  it.each([
    new Response('down', { status: 503 }),
    new Response('<html>not an image</html>', { headers: { 'content-type': 'text/html' } }),
    new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
    new Response('', { headers: { 'content-type': 'image/png' } }),
  ])('rejects failures and non-raster content instead of saving a misleading file', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(imageFile('https://cdn.example/photo', 1, new AbortController().signal)).rejects.toThrow()
  })
  it('propagates blocked or cancelled downloads so the caller can offer the original', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')))
    await expect(imageFile('https://cdn.example/photo', 1, new AbortController().signal)).rejects.toThrow('CORS')
  })
})
