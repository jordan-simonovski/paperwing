import { beforeEach, describe, expect, it, vi } from 'vitest'

const puts: { collection: string; rkey: string; record: Record<string, unknown> }[] = []
vi.mock('./atproto', () => ({
  deleteRecord: async () => {},
  putRecord: async (collection: string, rkey: string, record: Record<string, unknown>) => {
    puts.push({ collection, rkey, record })
    return { uri: `at://did:plc:x/${collection}/${rkey}`, cid: 'c' }
  },
  useAtproto: Object.assign(() => undefined, { getState: () => ({ did: 'did:plc:ukwly4246zmbi537o4u36pff' }) }),
}))

const { publishMix } = await import('./mixes')
type Mix = Parameters<typeof publishMix>[0]

const mix = (sources: Mix['sources']): Mix => ({ id: 'bbbbbbbbbbbbb', name: 'Work', sources, updatedAt: Date.parse('2026-11-01T00:00:00Z') })
const open = { kind: 'rss' as const, url: 'https://jvns.ca/atom.xml', label: 'Julia Evans' }
const secret = { kind: 'rss' as const, url: 'https://gitlab.example/me.atom?feed_token=glft-secret', label: 'GitLab activity' }

beforeEach(() => {
  puts.length = 0
})

describe('publishing a mix', () => {
  it('leaves private feeds out of the record, and out of its Bluesky feed', async () => {
    await publishMix(mix([{ kind: 'topic', id: 'space' }, open, secret]), true)
    const record = puts.find((p) => p.collection === 'io.paperwing.mix')!.record
    expect(record.sources).toEqual([{ kind: 'topic', id: 'space' }, open])
    expect(JSON.stringify(puts)).not.toContain('glft-secret')
  })

  it('won’t publish a mix whose only sources are private', async () => {
    await expect(publishMix(mix([secret]))).rejects.toThrow(/private/)
    expect(puts).toHaveLength(0)
  })
})
