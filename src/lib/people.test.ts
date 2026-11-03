import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPerson } from './people'

// A profile that can't be loaded says why: a busy server isn't a missing person.

afterEach(() => vi.unstubAllGlobals())

const answer = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })),
  )

describe('fetchPerson', () => {
  it('passes on the server’s reason when it’s asked for too much at once', async () => {
    answer(429, { error: 'That was a lot at once. Try again in a minute.' })
    await expect(fetchPerson('ana.example')).rejects.toThrow('That was a lot at once. Try again in a minute.')
  })

  it('says a malformed handle isn’t one, and anything else isn’t found', async () => {
    answer(400, { error: 'actor (a handle or DID) required' })
    await expect(fetchPerson('?')).rejects.toThrow('That isn’t a Bluesky handle')
    answer(502, { error: 'Upstream 404' })
    await expect(fetchPerson('nobody.example')).rejects.toThrow('Couldn’t find that person on Bluesky')
  })
})
