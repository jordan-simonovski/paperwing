import { describe, expect, it, vi } from 'vitest'

vi.mock('./sources.js', () => ({
  lobstersThread: vi.fn(async (id: string) => {
    throw new Error(id === 'gone' ? 'HTTP 404' : 'HTTP 503')
  }),
}))
const { GET } = await import('../thread.js')
const thread = (id: string) => GET(new Request(`https://paperwing.io/api/thread?src=lobsters&id=${id}`))

describe('a thread that can’t be read', () => {
  it('removed where it was posted: says so, and caches that a while', async () => {
    const res = await thread('gone')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'It was removed or deleted on Lobsters' })
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=600/)
  })
  it('a passing failure isn’t cached', async () => {
    const res = await thread('busy')
    expect(res.status).toBe(502)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
