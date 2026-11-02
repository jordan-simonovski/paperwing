import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => import('../test/memoryIdb'))
import { useLibrary } from './library'
import { usePrefs } from './store'
import { formatCode, joinSync, newSyncCode, notSyncedText, syncNow, useSync } from './sync'

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

  it('joining a new code mid-sync gives the new code its own first sync, untouched by the old run', async () => {
    const [oldCode, newCode] = [newSyncCode(), newSyncCode()]
    let release = () => {}
    const slowOld = new Promise<void>((r) => (release = r))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const code = new Headers(init?.headers).get('x-sync-code')
        if (code === oldCode) await slowOld
        return new Response(JSON.stringify({ records: [], cursor: code === oldCode ? 5 : 9, more: false }), { status: 200 })
      }),
    )
    useSync.getState().setCode(oldCode)
    const oldRun = syncNow()
    const joined = joinSync(newCode)
    release()
    await Promise.all([oldRun, joined])
    expect(useSync.getState()).toMatchObject({ code: newCode, cursor: 9, error: undefined })
  })

  it('a newly joined code gets everything this device holds, including what it pulled from the old code', async () => {
    const [oldCode, newCode] = [newSyncCode(), newSyncCode()]
    const { seal } = await import('./syncCrypto')
    const pulled = await seal(oldCode, { key: 'prefs', updatedAt: 5, data: { followed: ['physics'] } })
    const sentTo: Record<string, number> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const code = new Headers(init?.headers).get('x-sync-code')!
        const body = JSON.parse(String(init?.body)) as { changes: unknown[] }
        sentTo[code] = (sentTo[code] ?? 0) + body.changes.length
        return new Response(JSON.stringify({ records: code === oldCode ? [pulled] : [], cursor: 1, more: false }), { status: 200 })
      }),
    )
    await joinSync(oldCode)
    await joinSync(newCode)
    expect(sentTo[newCode]).toBeGreaterThan(0)
  })
})

describe('preferences from another device', () => {
  const pull = async (data: Record<string, unknown>) => {
    const code = newSyncCode()
    const { seal } = await import('./syncCrypto')
    const record = await seal(code, { key: 'prefs', updatedAt: Date.now() + 1000, data })
    vi.stubGlobal('fetch', answer(200, { records: [record], cursor: 1, more: false }))
    await joinSync(code)
  }
  beforeEach(() => usePrefs.setState({ ...usePrefs.getInitialState(), syncedPrefsAt: 0 }))

  it('arrive whole: people you follow, boards you joined and your blogroll setting included', async () => {
    const people = [{ did: 'did:plc:abc', handle: 'someone.example' }]
    const boards = [{ did: 'did:plc:abc', rkey: 'aaaaaaaaaaaaa', name: 'Slow reads' }]
    await pull({ followed: ['physics'], people, boards, blogrollPublic: true, affinity: { 'topic:physics': 2 } })
    expect(usePrefs.getState()).toMatchObject({ followed: ['physics'], people, boards, blogrollPublic: true, affinity: { 'topic:physics': 2 } })
  })

  it('a value of the wrong shape is left out, not written into your settings', async () => {
    await pull({ followed: 'physics', people: { did: 'x' }, blogrollPublic: 'yes', affinity: [1] })
    expect(usePrefs.getState()).toMatchObject({ followed: usePrefs.getInitialState().followed, people: [], blogrollPublic: false, affinity: {} })
  })
})

describe('a record the server won’t store', () => {
  it('is remembered and named, without failing the sync, until it goes up', async () => {
    usePrefs.setState({ ...usePrefs.getInitialState(), followed: ['physics'], syncedPrefsAt: Date.now() })
    vi.stubGlobal('fetch', answer(200, { records: [], cursor: 1, more: false, accepted: 0, tooLarge: ['prefs'] }))
    await joinSync(newSyncCode())
    expect(useSync.getState()).toMatchObject({ error: undefined, notSynced: ['prefs'] })
    expect(notSyncedText(useSync.getState().notSynced)).toBe('your settings')

    // Trimmed and changed: it goes up, and the notice goes with it.
    usePrefs.getState().set({ followed: ['maths'] })
    vi.stubGlobal('fetch', answer(200, { records: [], cursor: 2, more: false, accepted: 1, tooLarge: [] }))
    await syncNow()
    expect(useSync.getState().notSynced).toEqual([])
  })

  it('says how much in a few words', () => {
    expect(notSyncedText(['s:a', 's:b', 'prefs'])).toBe('your settings and 2 saved items')
    expect(notSyncedText(['s:a'])).toBe('one saved item')
    expect(notSyncedText([])).toBeUndefined()
  })
})

describe('whether this deployment syncs', () => {
  it('asks again after a failed first ask: opening the app offline doesn’t turn sync off for the session', async () => {
    const { syncAvailable } = await import('./sync')
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValue(new Response(JSON.stringify({ enabled: true }))),
    )
    expect(await syncAvailable()).toBe(false)
    expect(await syncAvailable()).toBe(true)
  })
})
