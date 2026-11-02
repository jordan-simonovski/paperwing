import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => import('../test/memoryIdb'))
import { useLibrary } from './library'
import { formatCode, joinSync, newSyncCode, useSync } from './sync'

// Joining sync, through its interface: a code in, the first sync run, and what a person is told.

const fetched: string[] = []
const answer = (status: number, body: unknown) => vi.fn(async (url: RequestInfo | URL) => (fetched.push(String(url)), new Response(JSON.stringify(body), { status })))

beforeEach(() => {
  fetched.length = 0
  useSync.setState(useSync.getInitialState(), true)
  useLibrary.setState({ ready: true, items: {} })
  vi.stubGlobal('navigator', { onLine: true })
})
afterEach(() => vi.unstubAllGlobals())

describe('joining sync', () => {
  it('refuses something that isn’t a code, without asking the server', async () => {
    vi.stubGlobal('fetch', answer(200, {}))
    await expect(joinSync('not a code')).rejects.toThrow('A sync code is 26 letters and digits')
    expect(fetched).toEqual([])
    expect(useSync.getState().code).toBeUndefined()
  })

  it('takes the code however it was copied: dashes, capitals, spaces', async () => {
    vi.stubGlobal('fetch', answer(200, { records: [], cursor: 5, more: false }))
    const code = newSyncCode()
    await joinSync(`  ${formatCode(code).toUpperCase()} `)
    expect(useSync.getState()).toMatchObject({ code, cursor: 5, error: undefined })
  })

  it('says what went wrong when the first sync fails, and keeps the code to try again', async () => {
    vi.stubGlobal('fetch', answer(503, { error: 'Sync store answered 503' }))
    const code = newSyncCode()
    await expect(joinSync(code)).rejects.toThrow('Couldn’t sync: Sync store answered 503')
    expect(useSync.getState().code).toBe(code)
  })

  it('marks a code that came from a passkey, even when this device already had it', async () => {
    vi.stubGlobal('fetch', answer(200, { records: [], cursor: 1, more: false }))
    const code = newSyncCode()
    await joinSync(code)
    expect(useSync.getState().passkey).toBe(false)
    await joinSync(code, { passkey: true })
    expect(useSync.getState()).toMatchObject({ code, passkey: true })
  })
})
