import { describe, expect, it } from 'vitest'
import { bskyKeyOf } from './bskyPost'
import { friendPlace, friendsFor, type Friend } from './friends'
import { linkId } from './sources/bluesky'

const quoteKey = bskyKeyOf('at://did:plc:rich/app.bsky.feed.post/3kq1')
const rich: Friend = { handle: 'rich.dev', name: 'Rich', how: 'quoted', post: quoteKey, text: 'The archive is the story.', likes: 4, replies: 9, at: 1 }

describe('friendPlace', () => {
  it('turns a quote or a post of their own into a place it is being discussed', () => {
    expect(friendPlace(rich)).toMatchObject({ key: quoteKey, source: 'bluesky', sourceLabel: 'Rich', comments: 9, hasThread: true, discussionUrl: 'https://bsky.app/profile/rich.dev/post/3kq1' })
    expect(friendPlace({ ...rich, how: 'posted' })?.key).toBe(quoteKey)
  })

  it('names the post by its author when it has no words', () => {
    expect(friendPlace({ ...rich, text: '' })?.title).toBe('Rich on Bluesky')
  })

  it('makes no place of a reply, a repost, an old cached share or a post it can’t open', () => {
    expect(friendPlace({ ...rich, how: 'replied' })).toBeUndefined()
    expect(friendPlace({ ...rich, how: 'reposted', post: undefined })).toBeUndefined()
    expect(friendPlace({ handle: 'old.dev', how: 'shared' })).toBeUndefined()
    expect(friendPlace({ ...rich, post: 'hn-123' })).toBeUndefined()
  })
})

describe('friendsFor', () => {
  const a = 'https://example.com/a'
  // A mobile copy of the same article: the feed groups it with the original, but its link key differs.
  const b = 'https://m.example.com/a'

  it('lists each person once, the most worth reading first, old cached shares among the posts', () => {
    const map = {
      [linkId(a)]: [{ handle: 'carol.dev', how: 'reposted' }, { handle: 'old.dev', how: 'shared' }, { handle: 'molly.dev', how: 'replied' }, rich] as Friend[],
    }
    expect(friendsFor(map, [a]).map((f) => [f.handle, f.how])).toEqual([
      ['rich.dev', 'quoted'],
      ['old.dev', 'shared'],
      ['molly.dev', 'replied'],
      ['carol.dev', 'reposted'],
    ])
  })

  it('keeps a person at what they did that says most, across every copy of the link', () => {
    expect(linkId(a)).not.toBe(linkId(b))
    const map = { [linkId(a)]: [{ handle: 'rich.dev', how: 'reposted' }] as Friend[], [linkId(b)]: [rich] }
    expect(friendsFor(map, [a, b])).toEqual([rich])
  })
})
