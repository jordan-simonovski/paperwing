import { beforeEach, describe, expect, it, vi } from 'vitest'

const puts: { collection: string; rkey: string; record: Record<string, unknown> }[] = []
const deletes: string[] = []
/** What each of your mix records holds now, as Bluesky has it. */
const live: Record<string, Record<string, unknown>> = {}
vi.mock('./atproto', () => ({
  deleteRecord: async (uri: string) => {
    deletes.push(uri)
  },
  getOwnRecord: async (collection: string, rkey: string) => {
    const value = live[rkey]
    if (!value) throw new Error('RecordNotFound')
    return { uri: `at://did:plc:ukwly4246zmbi537o4u36pff/${collection}/${rkey}`, cid: 'c', value }
  },
  putRecord: async (collection: string, rkey: string, record: Record<string, unknown>) => {
    puts.push({ collection, rkey, record })
    return { uri: `at://did:plc:x/${collection}/${rkey}`, cid: 'c' }
  },
  useAtproto: Object.assign(() => undefined, { getState: () => ({ did: 'did:plc:ukwly4246zmbi537o4u36pff' }) }),
}))

const { publishMix, refreshFollowedMixes, scrubPublishedMixes } = await import('./mixes')
const { resolveChannel } = await import('./channels')
const { usePrefs } = await import('./store')
type Mix = Parameters<typeof publishMix>[0]

const mix = (sources: Mix['sources']): Mix => ({ id: 'bbbbbbbbbbbbb', name: 'Work', sources, updatedAt: Date.parse('2026-11-01T00:00:00Z') })
const open = { kind: 'rss' as const, url: 'https://jvns.ca/atom.xml', label: 'Julia Evans' }
const secret = { kind: 'rss' as const, url: 'https://gitlab.example/me.atom?feed_token=glft-secret', label: 'GitLab activity' }

beforeEach(() => {
  puts.length = 0
  deletes.length = 0
  for (const k of Object.keys(live)) delete live[k]
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

describe('mixes published before private feeds were kept out', () => {
  const uri = 'at://did:plc:ukwly4246zmbi537o4u36pff/io.paperwing.mix/bbbbbbbbbbbbb'
  const publishedMix = (sources: Mix['sources']): Mix => ({ ...mix(sources), published: uri })

  it('are republished without them on load', async () => {
    live.bbbbbbbbbbbbb = { name: 'Work', sources: [open, secret] }
    usePrefs.setState({ mixes: [publishedMix([open, secret])] })
    await scrubPublishedMixes()
    expect(puts.find((p) => p.collection === 'io.paperwing.mix')?.record.sources).toEqual([open])
  })

  it('are unpublished when they have nothing public left', async () => {
    live.bbbbbbbbbbbbb = { name: 'Work', sources: [secret] }
    usePrefs.setState({ mixes: [publishedMix([secret])] })
    await scrubPublishedMixes()
    expect(deletes).toContain(uri)
    expect(puts).toHaveLength(0)
    expect(usePrefs.getState().mixes[0].published).toBeUndefined()
  })

  it('are left alone once Bluesky holds nothing private', async () => {
    live.bbbbbbbbbbbbb = { name: 'Work', sources: [open] }
    usePrefs.setState({ mixes: [publishedMix([open, secret])] })
    await scrubPublishedMixes()
    expect(puts).toHaveLength(0)
    expect(deletes).toHaveLength(0)
  })
})

describe('mixes you follow', () => {
  it('never fetch a private feed, even one stored before they were kept out', async () => {
    const followed = { uri: 'at://did:plc:ownerownerownerownerowne/io.paperwing.mix/ccccccccccccc', name: 'Theirs', by: 'owner.example', sources: [open, secret], fetchedAt: Date.now() }
    usePrefs.setState({ followedMixes: [followed] })
    const channel = resolveChannel('mix:did:plc:ownerownerownerownerowne:ccccccccccccc', undefined, { followed: [], interests: [], customFeeds: [], followedMixes: [followed] })
    expect(JSON.stringify(channel?.feeds)).not.toContain('feed_token')
    await refreshFollowedMixes()
    expect(usePrefs.getState().followedMixes[0].sources).toEqual([open])
  })
})
