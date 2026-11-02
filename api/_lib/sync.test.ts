import { beforeAll, describe, expect, it } from 'vitest'
import { open, type SyncRecord } from '../../src/lib/syncCrypto'

const code = 'abcdefghijklmnopqrstuvwxyz'.replace(/[01890]/g, '2').slice(0, 26)
let POST: (r: Request) => Promise<Response>

beforeAll(async () => {
  process.env.SYNC_MEMORY = '1'
  ;({ POST } = await import('../sync'))
})

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request(`https://readout.test/api/sync${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }))

describe('sync inbox', () => {
  it('queues a shared link for every device to pull', async () => {
    // The Shortcut sends the shared item as text, which can carry a title before the link; the code as shown in Settings has dashes.
    const res = await post('?inbox', { code: 'ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-Z', url: 'Great read https://example.com/post?a=1', title: 'A great read' })
    expect(res.status).toBe(200)
    const pulled = (await (await post('', { since: 0, changes: [] }, { 'x-sync-code': code })).json()) as { records: SyncRecord[] }
    // Stored sealed: neither the link nor its title is readable without the code.
    expect(pulled.records.every((r) => r.key.startsWith('x:'))).toBe(true)
    expect(JSON.stringify(pulled.records)).not.toContain('example.com')
    const opened = await Promise.all(pulled.records.map((r) => open(code, r)))
    const saved = opened.find((r) => r?.key.startsWith('s:ln-')) as { data: { story: { url: string; title: string }; state: string } }
    expect(saved.data.story).toMatchObject({ url: 'https://example.com/post?a=1', title: 'A great read' })
    expect(saved.data.state).toBe('queue')
  })
  it('refuses a missing code or link', async () => {
    expect((await post('?inbox', { url: 'https://example.com' })).status).toBe(400)
    expect((await post('?inbox', { code, url: 'not a link' })).status).toBe(400)
  })
})
