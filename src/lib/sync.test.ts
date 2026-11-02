import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => import('../test/memoryIdb'))
import { useLibrary, type SavedItem } from './library'
import { usePrefs } from './store'
import { useSummaries, type CachedSummary } from './summaryCache'
import { formatCode, joinSync, newSyncCode, notSyncedText, syncNow, useSync } from './sync'
import { useWatch } from './watch'
import { story } from '../test/fixtures'

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
    // The server only ever sees sealed keys, so it can only name those back.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const { changes } = JSON.parse(String(init?.body)) as { changes: { key: string }[] }
        return new Response(JSON.stringify({ records: [], cursor: 1, more: false, accepted: 0, tooLarge: changes.map((c) => c.key) }), { status: 200 })
      }),
    )
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

describe('plain records from before sync was encrypted', () => {
  // Anyone who can write to the database can add a plain record and date it before encryption
  // began. It still counts, as old records do, but only as of that date: its own times can't make
  // it outrank anything newer.
  const before = Date.UTC(2026, 9, 29, 8)
  const future = Date.now() + 365 * 86_400_000
  const pull = (...records: unknown[]) => vi.stubGlobal('fetch', answer(200, { records, cursor: 1, more: false }))

  const summary = (gist: string, updatedAt: number): CachedSummary => ({
    key: 'hn-1',
    summary: { gist, themes: [], disagreements: [], standouts: [], contrast: null },
    model: 'm',
    refs: [],
    sent: 1,
    total: 1,
    comments: 1,
    places: ['HN'],
    at: Date.now(),
    updatedAt,
  })

  it('a backdated summary can’t replace a newer one by claiming a later time inside', async () => {
    await useSummaries.getState().put(summary('What people actually said.', Date.now()))
    pull({ key: 'm:hn-1', updatedAt: before, data: summary('Planted.', future) })
    await joinSync(newSyncCode())
    expect(useSummaries.getState().items['hn-1']?.summary.gist).toBe('What people actually said.')
  })

  it('a backdated watched thread can’t replace a newer one by claiming a later time inside', async () => {
    const s = story({ key: 'hn-2' })
    useWatch.setState({ items: { 'hn-2': { story: s, addedAt: 1, lookedAt: 1, removedAt: Date.now(), updatedAt: Date.now() } } })
    pull({ key: 'w:hn-2', updatedAt: before, data: { story: s, addedAt: 1, lookedAt: 1, updatedAt: future } })
    await joinSync(newSyncCode())
    expect(useWatch.getState().items['hn-2'].removedAt).toBeDefined()
  })

  it('a backdated saved story is kept as of its record’s date, not a later one inside', async () => {
    const s = story({ key: 'hn-3' })
    // Archived, so nothing starts downloading it.
    const item: SavedItem = { story: s, savedAt: 1, state: 'archive', seen: [], updatedAt: future }
    pull({ key: 's:hn-3', updatedAt: before, data: item })
    await joinSync(newSyncCode())
    expect(useLibrary.getState().items['hn-3'].updatedAt).toBeLessThanOrEqual(before)
  })
})

describe('plain settings records', () => {
  it('are ignored: only sealed settings can change yours (they decide what your blogroll publishes)', async () => {
    usePrefs.setState({ ...usePrefs.getInitialState(), followed: ['web'], blogrollPublic: true, syncedPrefsAt: 0 })
    const before = Date.UTC(2026, 9, 29, 8)
    vi.stubGlobal(
      'fetch',
      answer(200, {
        records: [{ key: 'prefs', updatedAt: before, data: { followed: ['physics'], customFeeds: [{ url: 'https://planted.example/feed' }], blogrollPublic: true } }],
        cursor: 1,
        more: false,
      }),
    )
    await joinSync(newSyncCode())
    expect(usePrefs.getState()).toMatchObject({ followed: ['web'], customFeeds: [] })
  })
})
