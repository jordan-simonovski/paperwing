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
})
