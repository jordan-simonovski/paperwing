import { describe, expect, it } from 'vitest'
import { resolveChannel } from './channels'
import { afterPublishing, mixChannel, tid } from './mixes'
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
  it('never carry a private feed’s address, even in a mix published before it was kept out', () => {
    const mix = cleanMix({
      name: 'Work',
      sources: [
        { kind: 'rss', url: 'https://jvns.ca/atom.xml', label: 'Julia Evans' },
        { kind: 'rss', url: 'https://gitlab.example/me.atom?feed_token=glft-secret', label: 'GitLab activity' },
        { kind: 'standard', url: 'https://me:hunter2@writer.example/journal', label: 'Private journal' },
      ],
    })
    expect(mix?.sources.map((s) => ('label' in s ? s.label : ''))).toEqual(['Julia Evans'])
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

describe('publishing from the editor', () => {
  it('keeps edits made while it ran', () => {
    const sent = { id: 'abc', name: 'Moon', sources: [{ kind: 'topic' as const, id: 'space' }], updatedAt: 1 }
    const done = { ...sent, published: 'at://did:plc:me/io.paperwing.mix/abc', feed: 'at://did:plc:me/app.bsky.feed.generator/abc', updatedAt: 2 }
    // Renamed, and a search added, while Bluesky was being written to.
    const editing = { ...sent, name: 'Moon and Mars', sources: [...sent.sources, { kind: 'news' as const, q: 'Mars' }] }
    expect(afterPublishing(editing, done)).toEqual({ ...editing, published: done.published, feed: done.feed })
  })
  it('clears what unpublishing took down', () => {
    const editing = { id: 'abc', name: 'Moon', sources: [], published: 'at://did:plc:me/io.paperwing.mix/abc', feed: 'at://did:plc:me/app.bsky.feed.generator/abc', updatedAt: 1 }
    const done = { ...editing, published: undefined, feed: undefined }
    expect(afterPublishing(editing, done)).toEqual(done)
  })
})
