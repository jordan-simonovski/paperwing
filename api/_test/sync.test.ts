import { afterEach, describe, expect, it, vi } from 'vitest'
import { clientKey, today } from '../_lib/http.js'
import { kv } from '../_lib/kv.js'
import { call, memoryStore } from './harness.js'
import { POST } from '../sync.js'

// Sync between devices, end to end against the in-process store: what one device sends, another
// gets back, and the rules that keep it fair (newest wins, a daily allowance per caller).

memoryStore()
afterEach(() => vi.restoreAllMocks())

const CODE = 'abcdefghijklmnopqrstuvwxyz'.replace(/[01890]/g, '2')
const record = (key: string, updatedAt: number, data: unknown = { v: updatedAt }) => ({ key, updatedAt, data })
const sync = (body: unknown, headers: Record<string, string> = {}) =>
  call<{ records: { key: string; updatedAt: number; data?: unknown }[]; cursor: number; accepted: number; tooLarge?: string[]; error?: string }>(POST, '/api/sync', {
    json: body,
    headers: { 'x-sync-code': CODE, ...headers },
  })

describe('sync', () => {
  it('names any record it won’t store for size, so the device can say so rather than think it synced', async () => {
    const big = 'x'.repeat(30_000)
    const sent = await sync({ since: 0, changes: [record('s:huge', 100, big), record('x:small', 100)] })
    expect(sent.body).toMatchObject({ accepted: 1, tooLarge: ['s:huge'] })
  })

  it('gives your settings more room than a single saved item: a long list of feeds still syncs', async () => {
    const sent = await sync({ since: 0, changes: [record('prefs', 100, 'x'.repeat(120_000))] })
    expect(sent.body).toMatchObject({ accepted: 1, tooLarge: [] })
    expect((await sync({ since: 0, changes: [record('prefs', 200, 'x'.repeat(300_000))] })).body.tooLarge).toEqual(['prefs'])
  })

  it('hands one device’s changes to the next, and never caches the answer', async () => {
    const sent = await sync({ since: 0, changes: [record('x:a', 100), record('x:b', 100)] })
    expect(sent.body.accepted).toBe(2)
    // The sender doesn't get its own writes back.
    expect(sent.body.records).toEqual([])
    const other = await sync({ since: 0, changes: [] })
    expect(other.body.records.map((r) => r.key).sort()).toEqual(['x:a', 'x:b'])
    expect(other.headers.get('cache-control')).toBe('no-store')
  })

  it('keeps the newest version of a record, whichever device sends last', async () => {
    await sync({ since: 0, changes: [record('x:a', 200, 'newer')] })
    const stale = await sync({ since: 0, changes: [record('x:a', 100, 'older')] })
    expect(stale.body.accepted).toBe(0)
    const read = await sync({ since: 0, changes: [] })
    expect(read.body.records.find((r) => r.key === 'x:a')?.data).toBe('newer')
  })

  it('moves the cursor on, so the next sync only brings what changed since', async () => {
    await sync({ since: 0, changes: [record('x:a', 100)] })
    const first = await sync({ since: 0, changes: [] })
    const again = await sync({ since: first.body.cursor, exact: true, changes: [] })
    expect(again.body.records).toEqual([])
  })

  it('stops a caller who has used up today’s allowance', async () => {
    const headers = { 'x-forwarded-for': '198.51.100.20' }
    const who = clientKey(new Request('https://paperwing.test', { headers }))
    await kv().bump(`rd:sync-write:${who}:${today()}`, 86_400, 100_000)
    const res = await sync({ since: 0, changes: [record('x:a', 100)] }, headers)
    expect(res.status).toBe(429)
  })

  it('refuses writes while the allowance can’t be counted', async () => {
    vi.spyOn(kv(), 'bump').mockRejectedValue(new Error('Sync store answered 503'))
    expect((await sync({ since: 0, changes: [record('x:a', 100)] })).status).toBe(429)
  })

  it('refuses a bad code or a body it can’t read', async () => {
    expect((await sync({ since: 0 }, { 'x-sync-code': 'too-short' })).status).toBe(400)
    expect((await sync({ since: 0, changes: 'nope' })).status).toBe(400)
    expect((await call(POST, '/api/sync', { method: 'POST', body: '{', headers: { 'x-sync-code': CODE } })).status).toBe(400)
  })

  it('says so when this deployment has no sync store', async () => {
    delete process.env.SYNC_MEMORY
    expect((await sync({ since: 0, changes: [] })).status).toBe(501)
  })
})
