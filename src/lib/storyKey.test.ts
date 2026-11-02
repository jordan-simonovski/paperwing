import { describe, expect, it } from 'vitest'
import { parseStoryKey, storyKey } from './storyKey'

describe('story keys', () => {
  it('round-trip for every network', () => {
    const all = [
      { kind: 'hn', id: '42' },
      { kind: 'lb', id: 'abc123' },
      { kind: 'dv', id: '1971' },
      { kind: 'st', id: 'cloudflare-x9y8' },
      { kind: 'bs', uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz' },
      { kind: 'fp', uri: 'at://did:plc:abc/fyi.unravel.frontpage.post/3kabc' },
      { kind: 'ln', url: 'https://anildash.com/2012/12/13/the_web_we_lost/' },
      { kind: 'lm', id: '42', via: 'programming.dev' },
      { kind: 'lm', id: '42', via: 'lemmy.world' },
      { kind: 'md', instance: 'hachyderm.io', id: '113000000000000001' },
    ] as const
    for (const parts of all) expect(parseStoryKey(storyKey(parts))).toEqual(parts)
  })

  it('look the way they always have, so saved stories and shared links keep working', () => {
    expect(storyKey({ kind: 'hn', id: '42' })).toBe('hn-42')
    expect(storyKey({ kind: 'lm', id: '42', via: 'programming.dev' })).toBe('lm-42')
    expect(storyKey({ kind: 'lm', id: '42', via: 'lemmy.world' })).toBe('lm-42@lemmy.world')
    expect(storyKey({ kind: 'md', instance: 'hachyderm.io', id: '7' })).toBe('md-hachyderm.io-7')
  })

  it('encode links and records exactly as the server does', () => {
    const url = 'https://example.com/ünïcödé?q=a+b&c=d'
    expect(storyKey({ kind: 'ln', url })).toBe('ln-' + Buffer.from(url).toString('base64url'))
    const uri = 'at://did:plc:abc/app.bsky.feed.post/3kxyz'
    expect(storyKey({ kind: 'bs', uri })).toBe('bs-' + Buffer.from(uri).toString('base64url'))
  })

  it('reads a Mastodon server with hyphens in its name', () => {
    expect(parseStoryKey('md-mastodon-staging.example.org-99')).toEqual({ kind: 'md', instance: 'mastodon-staging.example.org', id: '99' })
  })

  it('refuses keys it does not know, rather than guessing', () => {
    for (const k of ['', 'hn', 'xx-1', 'hn-', 'lm-abc', 'md-nohost', 'ln-%%%']) expect(parseStoryKey(k), k).toBeUndefined()
  })
})
