import { describe, expect, it } from 'vitest'

describe('push keys', () => {
  it('makes a signing key pair once and keeps it, so push works with no setup', async () => {
    process.env.SYNC_MEMORY = '1'
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
    const { GET } = await import('../push')
    const key = async () => (await (await GET(new Request('https://readout.test/api/push?key'))).json()) as { enabled: boolean; publicKey: string }
    const first = await key()
    expect(first.enabled).toBe(true)
    expect(first.publicKey).toMatch(/^B[\w-]{80,}$/)
    expect((await key()).publicKey).toBe(first.publicKey)
  })
})
