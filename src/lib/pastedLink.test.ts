import { describe, expect, it } from 'vitest'
import { followable } from './pastedLink'

describe('a pasted link PaperWing can follow as itself', () => {
  it('opens a Bluesky feed, keeping who made it to look up', () => {
    expect(followable('https://bsky.app/profile/alice.bsky.social/feed/science')).toEqual({ kind: 'bskyFeed', actor: 'alice.bsky.social', rkey: 'science', label: 'Open this Bluesky feed' })
  })

  it('opens a Bluesky person’s posts', () => {
    expect(followable('https://bsky.app/profile/alice.bsky.social')).toMatchObject({ kind: 'path', path: '/t/u:alice.bsky.social' })
  })

  it('opens a Lemmy community on the instance it was pasted from', () => {
    expect(followable('https://lemmy.world/c/technology')).toMatchObject({ kind: 'path', path: '/t/c:technology@lemmy.world', label: 'Open c/technology on Lemmy', guess: true })
    expect(followable('https://lemmy.ml/c/linux@programming.dev')).toMatchObject({ path: '/t/c:linux@programming.dev' })
  })

  it('opens a PaperWing board', () => {
    expect(followable('https://paperwing.io/c/did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbb')).toMatchObject({
      kind: 'path',
      path: '/c/did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbb',
      label: 'Open this board',
    })
  })

  it('leaves sites, posts and anything else to the finder or to posting', () => {
    expect(followable('https://example.com/blog/post')).toBeUndefined()
    expect(followable('https://bsky.app/profile/alice.bsky.social/post/3k')).toBeUndefined()
    expect(followable('https://lemmy.world/post/123')).toBeUndefined()
    expect(followable('not a link')).toBeUndefined()
  })

  it('copes with a mangled address rather than breaking Find', () => {
    expect(() => followable('https://bsky.app/profile/%E0%A4%A')).not.toThrow()
  })
})
