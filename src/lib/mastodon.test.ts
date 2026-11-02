import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { favourite, useMastodon } from './mastodon'

describe('favouriting on Mastodon', () => {
  beforeEach(() => useMastodon.setState({ instance: 'hachyderm.io', token: 'tok', favourites: {} }))
  afterEach(() => vi.unstubAllGlobals())

  it('takes the favourite back off when the server can’t be reached', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    await expect(favourite('md-hachyderm.io-7', true)).rejects.toThrow(/Couldn’t reach hachyderm.io/)
    expect(useMastodon.getState().favourites).toEqual({})
  })

  it('takes the favourite back off when the server says no', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{}', { status: 500 })))
    await expect(favourite('md-hachyderm.io-7', true)).rejects.toThrow(/Mastodon didn’t take that/)
    expect(useMastodon.getState().favourites).toEqual({})
  })

  it('takes back only the one that failed: a favourite made meanwhile on another post stays', async () => {
    let fail!: () => void
    vi.stubGlobal('fetch', (url: string) =>
      url.includes('/7/') ? new Promise((_, reject) => (fail = () => reject(new TypeError('Failed to fetch')))) : Promise.resolve(new Response('{}', { status: 200 })),
    )
    const first = favourite('md-hachyderm.io-7', true)
    await favourite('md-hachyderm.io-8', true)
    fail()
    await expect(first).rejects.toThrow()
    expect(useMastodon.getState().favourites).toEqual({ 'md-hachyderm.io-8': true })
  })
})
