import { describe, expect, it } from 'vitest'
import { postMedia, postWords, selfPostOf, sharedLink } from './bskyPost'
import { selfPostUrl } from './paperwing'
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
  it('a self post shares no link: its card is its own page on PaperWing', () => {
    const uri = 'at://did:plc:ukwly4246zmbi537o4u36pff/app.bsky.feed.post/3m2abcdefghij'
    const self = { uri, record: { text: 'Ask PaperWing' }, embed: { $type: 'app.bsky.embed.external#view', external: { uri: selfPostUrl(uri) } } }
    expect(sharedLink(self)).toBeUndefined()
    expect(selfPostOf(self)).toBe(true)
    // Another post linking to it shares it like any other link.
    const other = { ...self, uri: 'at://did:plc:ukwly4246zmbi537o4u36pff/app.bsky.feed.post/3m2abcdefghik' }
    expect(sharedLink(other)).toBe(selfPostUrl(uri))
    expect(selfPostOf(other)).toBe(false)
  })
  it('a picture post is a self post too: its words link to its own page', () => {
    const uri = 'at://did:plc:ukwly4246zmbi537o4u36pff/app.bsky.feed.post/3m2abcdefghij'
    const pictures = {
      uri,
      record: { text: 'Our new kitchen\n\npaperwing.io', facets: [link(selfPostUrl(uri))] },
      embed: { $type: 'app.bsky.embed.images#view', images: [{ thumb: 't', fullsize: 'f', alt: 'A kitchen' }] },
    }
    expect(selfPostOf(pictures)).toBe(true)
    expect(sharedLink(pictures)).toBeUndefined()
    expect(postMedia(pictures)?.[0]).toMatchObject({ kind: 'image', alt: 'A kitchen' })
    // Its words without the link back to the page they're shown on.
    expect(postWords(pictures)).toBe('Our new kitchen')
    expect(postWords({ uri: 'at://did:plc:x/app.bsky.feed.post/3m2abcdefghik', record: { text: 'Look\n\npaperwing.io' } })).toBe('Look\n\npaperwing.io')
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
