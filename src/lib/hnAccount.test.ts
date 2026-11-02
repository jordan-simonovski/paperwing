import { afterEach, describe, expect, it, vi } from 'vitest'
import { hnSubmit, useHn } from './hnAccount'

// HN is reached through PaperWing's /api/hn: the network boundary, stubbed here.
const answer = (status: number, body: object) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  )

afterEach(() => {
  vi.unstubAllGlobals()
  useHn.setState({ user: undefined, cookie: undefined, votes: {} })
})

describe('submitting to Hacker News', () => {
  it('signs you out here when HN says the session has expired, as a vote does', async () => {
    useHn.setState({ user: 'pg', cookie: 'user=pg&abc' })
    answer(401, { error: 'Sign in to Hacker News again' })
    await expect(hnSubmit('The Web We Lost', 'https://anildash.com/')).rejects.toThrow('Sign in to Hacker News again')
    expect(useHn.getState().cookie).toBeUndefined()
  })
  it('hands back the thread, and says when the link was already there', async () => {
    useHn.setState({ user: 'pg', cookie: 'user=pg&abc' })
    answer(200, { url: 'https://news.ycombinator.com/item?id=1', existing: true })
    await expect(hnSubmit('The Web We Lost', 'https://anildash.com/')).resolves.toEqual({ url: 'https://news.ycombinator.com/item?id=1', existing: true })
  })
})
