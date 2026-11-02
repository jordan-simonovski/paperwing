import { describe, expect, it } from 'vitest'
import { findFacets, graphemes } from './facets'

describe('Bluesky rich text', () => {
  it('finds links, mentions and tags by UTF-8 byte range', () => {
    const text = 'Read https://example.com/post, and @jay.bsky.team said #atproto 🦋 rocks: example.dev/x.'
    const f = findFacets(text)
    const slice = (s: number, e: number) => new TextDecoder().decode(new TextEncoder().encode(text).slice(s, e))
    expect(f.map((x) => [x.kind, x.value, slice(x.start, x.end)])).toEqual([
      ['link', 'https://example.com/post', 'https://example.com/post'],
      ['mention', 'jay.bsky.team', '@jay.bsky.team'],
      ['tag', 'atproto', '#atproto'],
      ['link', 'https://example.dev/x', 'example.dev/x'],
    ])
  })

  it('leaves dotted words that are not links alone, and counts emoji as one', () => {
    expect(findFacets('see e.g. config.ts and #123').map((x) => x.kind)).toEqual([])
    expect(graphemes('hi 👋🏽')).toBe(4)
  })
})
