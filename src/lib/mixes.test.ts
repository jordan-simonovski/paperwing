import { describe, expect, it } from 'vitest'
import { resolveChannel } from './channels'
import { mixChannel, tid } from './mixes'
import { AT_MIX, cleanMix, MIX_NSID, mixUri } from './mixSources'

const base = { followed: [] as string[], interests: [], customFeeds: [] }

describe('mix records', () => {
  it('keep only sources that check out', () => {
    const mix = cleanMix({
      name: '  Footy  ',
      sources: [
        { kind: 'topic', id: 'football' },
        { kind: 'topic', id: 'not-a-topic' },
        { kind: 'rss', url: 'https://www.theguardian.com/football/rss', label: 'Guardian Football' },
        { kind: 'rss', url: 'javascript:alert(1)', label: 'x' },
        { kind: 'lemmy', community: 'soccer@lemmy.world', via: 'lemmy.world' },
        { kind: 'lemmy', community: 'x@y.z', via: '169.254.169.254' },
        { kind: 'bskyFeed', uri: 'at://did:plc:ukwly4246zmbi537o4u36pff/app.bsky.feed.generator/aaadbzfr4m6dm', name: 'EPL' },
        { kind: 'news', q: 'Matildas' },
        { kind: 'news', q: 'Matildas' },
        { kind: 'shell', cmd: 'rm -rf /' },
      ],
    })
    expect(mix?.name).toBe('Footy')
    expect(mix?.sources.map((s) => s.kind)).toEqual(['topic', 'rss', 'lemmy', 'bskyFeed', 'news'])
  })
  it('reject a mix with nothing usable', () => {
    expect(cleanMix({ name: 'x', sources: [{ kind: 'topic', id: 'nope' }] })).toBeUndefined()
    expect(cleanMix({ sources: [{ kind: 'news', q: 'a' }] })).toBeUndefined()
    expect(cleanMix('nope')).toBeUndefined()
  })
  it('have TID keys their share links can carry', () => {
    const a = tid()
    expect(a).toMatch(/^[2-7a-z]{13}$/)
    expect(AT_MIX.test(mixUri('did:plc:ukwly4246zmbi537o4u36pff', a))).toBe(true)
    expect(AT_MIX.test(`at://did:plc:ukwly4246zmbi537o4u36pff/${MIX_NSID}/../x`)).toBe(false)
  })
})

describe('mix channels', () => {
  const sources = [
    { kind: 'topic' as const, id: 'space' },
    { kind: 'news' as const, q: 'Artemis' },
  ]
  it('fetch each source, a topic as its main feeds', () => {
    const c = resolveChannel('mix:abc', undefined, { ...base, mixes: [{ id: 'abc', name: 'Moon', sources, updatedAt: 0 }] })!
    expect(c.label).toBe('Moon')
    expect(c.action).toEqual({ label: 'Edit', to: '/mixes/abc' })
    expect(c.feeds).toContainEqual({ kind: 'news', q: 'Artemis' })
    expect(c.feeds.some((f) => f.kind === 'rss')).toBe(true)
    expect(c.boost).toEqual(['space'])
  })
  it('resolve a followed mix by its author and key', () => {
    const uri = mixUri('did:plc:ukwly4246zmbi537o4u36pff', '3m2abcdefghij')
    const m = { uri, name: 'Moon', by: 'someone.bsky.social', sources, fetchedAt: 0 }
    expect(mixChannel(m)).toBe('mix:did:plc:ukwly4246zmbi537o4u36pff:3m2abcdefghij')
    const c = resolveChannel(mixChannel(m), undefined, { ...base, followedMixes: [m] })!
    expect(c.eyebrow).toBe('Mix by @someone.bsky.social')
    expect(resolveChannel('mix:did:plc:other:3m2abcdefghij', undefined, { ...base, followedMixes: [m] })).toBeUndefined()
  })
})
