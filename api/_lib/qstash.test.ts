import { createHash, createHmac } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'

let verifyQStash: typeof import('./qstash').verifyQStash
let ensureSchedules: typeof import('./qstash').ensureSchedules
beforeAll(async () => {
  process.env.QSTASH_CURRENT_SIGNING_KEY = 'current-key'
  process.env.QSTASH_NEXT_SIGNING_KEY = 'next-key'
  process.env.QSTASH_TOKEN = 'token'
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'bypass'
  ;({ verifyQStash, ensureSchedules } = await import('./qstash'))
})

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url')
const sign = (key: string, claims: object) => {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64(JSON.stringify(claims))
  return `${head}.${body}.${b64(createHmac('sha256', key).update(`${head}.${body}`).digest())}`
}
const url = 'https://readout.example/api/push?task=alerts'
const now = Date.now()
const good = { iss: 'Upstash', sub: url, exp: now / 1000 + 300, nbf: now / 1000 - 1, body: b64(createHash('sha256').update('').digest()) }
const req = (jwt: string, at = url) => new Request(at, { headers: { 'upstash-signature': jwt } })

describe('QStash signatures', () => {
  it('accepts a request signed with either key', () => {
    expect(verifyQStash(req(sign('current-key', good)))).toBe(true)
    expect(verifyQStash(req(sign('next-key', good)))).toBe(true)
  })
  it('refuses anything else', () => {
    expect(verifyQStash(req(sign('someone-else', good)))).toBe(false)
    expect(verifyQStash(req(sign('current-key', { ...good, exp: now / 1000 - 10 })))).toBe(false)
    expect(verifyQStash(req(sign('current-key', { ...good, iss: 'Other' })))).toBe(false)
    expect(verifyQStash(req(sign('current-key', good), 'https://readout.example/api/push'))).toBe(false)
    expect(verifyQStash(new Request(url))).toBe(false)
    // A token that names no destination could be replayed against any endpoint.
    expect(verifyQStash(req(sign('current-key', { ...good, sub: undefined })))).toBe(false)
  })
})

describe('QStash schedules', () => {
  it('forwards the Vercel protection bypass so a protected deployment can be reached', async () => {
    const fetch = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    expect(await ensureSchedules('https://readout.example/')).toBe(true)
    const calls = fetch.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map(([u]) => u)).toEqual([
      'https://qstash.upstash.io/v2/schedules/https://readout.example/api/push?task=alerts',
      'https://qstash.upstash.io/v2/schedules/https://readout.example/api/push?task=edition',
      'https://qstash.upstash.io/v2/schedules/https://readout.example/api/push?task=directory',
    ])
    for (const [, init] of calls) expect((init.headers as Record<string, string>)['Upstash-Forward-x-vercel-protection-bypass']).toBe('bypass')
    vi.unstubAllGlobals()
  })
})
