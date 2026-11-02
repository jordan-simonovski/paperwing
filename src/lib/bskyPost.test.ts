import { describe, expect, it } from 'vitest'
import { postMedia, sharedLink } from './bskyPost'
import { kindOf } from './rank'

const link = (uri: string) => ({ features: [{ $type: 'app.bsky.richtext.facet#link', uri }] })

describe('sharedLink', () => {
  it('prefers the preview card, then a link typed into the text', () => {
    expect(sharedLink({ record: { text: 'x', facets: [link('https://b.dev')] }, embed: { $type: 'app.bsky.embed.external#view', external: { uri: 'https://a.dev' } } })).toBe('https://a.dev')
    expect(sharedLink({ record: { text: 'read this b.dev', facets: [link('https://b.dev/post')] } })).toBe('https://b.dev/post')
  })
  it('treats reaction GIFs as no link', () => {
    expect(sharedLink({ record: { text: 'lol' }, embed: { $type: 'app.bsky.embed.external#view', external: { uri: 'https://static.klipy.com/gifs/abc.gif' } } })).toBeUndefined()
  })
  it('ignores links to other Bluesky posts', () => {
    expect(sharedLink({ record: { text: 'x', facets: [link('https://bsky.app/profile/a/post/1')] } })).toBeUndefined()
  })
})

describe('postMedia', () => {
  it('reads images directly and alongside a quoted post', () => {
    const images = { $type: 'app.bsky.embed.images#view', images: [{ thumb: 't', fullsize: 'f', alt: '', aspectRatio: { width: 4, height: 3 } }] }
    expect(postMedia({ record: { text: '' }, embed: images })).toEqual([{ kind: 'image', thumb: 't', full: 'f', alt: undefined, aspect: 4 / 3 }])
    expect(postMedia({ record: { text: '' }, embed: { $type: 'app.bsky.embed.recordWithMedia#view', media: images } })?.[0].kind).toBe('image')
  })
  it('reads video', () => {
    expect(postMedia({ record: { text: '' }, embed: { $type: 'app.bsky.embed.video#view', thumbnail: 't', playlist: 'p.m3u8' } })?.[0]).toMatchObject({ kind: 'video', playlist: 'p.m3u8' })
  })
})

describe('kindOf', () => {
  it('splits shared things from pure discussion', () => {
    expect(kindOf({ url: null, hasThread: true })).toBe('discussions')
    expect(kindOf({ url: null, hasThread: true, media: [{ kind: 'image', thumb: 't' }] })).toBe('shared')
    expect(kindOf({ url: 'https://a.dev', hasThread: true })).toBe('shared')
    expect(kindOf({ url: 'https://blog.dev/post', hasThread: false })).toBe('shared')
  })
})
