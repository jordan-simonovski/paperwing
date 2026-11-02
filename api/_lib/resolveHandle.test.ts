import { describe, expect, it, vi } from 'vitest'

const txt = new Map<string, string[][]>([['_atproto.simonwillison.net', [['did=did:plc:abcdefghijklmnopqrstuvwx']]]])
vi.mock('node:dns/promises', () => ({ resolveTxt: async (name: string) => txt.get(name) ?? Promise.reject(Object.assign(new Error('nodata'), { code: 'ENODATA' })) }))
vi.mock('./http.js', async (orig) => ({
  ...(await orig<typeof import('./http.js')>()),
  fetchText: async (url: string) => {
    if (url === 'https://jay.bsky.team/.well-known/atproto-did') return { text: 'did:plc:oky5czdrnfjpqslsw2a5iclo\n', finalUrl: url, contentType: 'text/plain' }
    if (url === 'https://evil.example/.well-known/atproto-did') return { text: '<html>not a did</html>', finalUrl: url, contentType: 'text/html' }
    throw new Error('Upstream 404')
  },
}))

describe('handle resolution for sign-in', () => {
  it('reads the DNS record, then the well-known file, and rejects anything else', async () => {
    const { resolveHandle } = await import('../atproto')
    expect(await resolveHandle('simonwillison.net')).toBe('did:plc:abcdefghijklmnopqrstuvwx')
    expect(await resolveHandle('jay.bsky.team')).toBe('did:plc:oky5czdrnfjpqslsw2a5iclo')
    expect(await resolveHandle('evil.example')).toBeUndefined()
    expect(await resolveHandle('nobody.example')).toBeUndefined()
  })

  it('answers the xrpc call, and refuses things that are not handles', async () => {
    const { GET } = await import('../atproto')
    const ask = async (h: string) => (await GET(new Request(`https://x.test/xrpc/com.atproto.identity.resolveHandle?route=com.atproto.identity.resolveHandle&handle=${encodeURIComponent(h)}`))).json()
    expect(await ask('jay.bsky.team')).toEqual({ did: 'did:plc:oky5czdrnfjpqslsw2a5iclo' })
    expect(await ask('localhost')).toMatchObject({ error: 'InvalidRequest' })
    expect(await ask('a.b/../c')).toMatchObject({ error: 'InvalidRequest' })
    expect(await ask('nobody.example')).toMatchObject({ error: 'HandleNotFound' })
  })
})
