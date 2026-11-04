import { describe, expect, it } from 'vitest'
import { channelShare } from './channelShare'
import { channelId } from './channelId'
import type { Channel } from './channels'

const channel = (id: string): Channel => ({ id, label: 'Reading', eyebrow: 'Feed', feeds: [] })
describe('sharing a channel', () => {
  it('keeps the chosen view without including a selected story or unrelated URL parameters', () => {
    expect(channelShare(channel('space'), { sort: 'new', sourceFilter: 'rss', kindFilter: 'shared' }).path).toBe('/t/space?sort=new&src=rss&kind=shared')
    expect(channelShare(channel('hn'), { sort: 'hot', variant: 'ask' }).path).toBe('/t/hn?sort=hot&v=ask')
  })
  it('escapes a publisher address as one path segment and preserves its format', () => {
    const id = 'feed:https://reading.example/feed?type=news&lang=en#posts'
    const c = { ...channel(id), feeds: [{ kind: 'standard' as const, url: id.slice(5), label: 'Reading' }] }
    const shared = new URL(channelShare(c, { sort: 'hot' }).path!, 'https://paperwing.io')
    expect(decodeURIComponent(shared.pathname.slice(3))).toBe(id)
    expect(shared.searchParams.get('format')).toBe('standard')
    expect(shared.hash).toBe('')
  })
  it('uses public mix pages and never shares a local mix id', () => {
    const id = '3m2abcdefghij'
    expect(channelShare(channel(`mix:${id}`), { sort: 'hot' })).toMatchObject({ edit: `/mixes/${id}` })
    expect(channelShare(channel(`mix:${id}`), { sort: 'hot' }).path).toBeUndefined()
    expect(
      channelShare(channel(`mix:${id}`), { sort: 'hot' }, [{ id, name: 'Reading', sources: [], updatedAt: 0, published: `at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/io.paperwing.mix/${id}` }]).path,
    ).toBe(`/mix/did%3Aplc%3Aaaaaaaaaaaaaaaaaaaaaaaaa/${id}`)
    expect(channelShare(channel(`mix:did:plc:aaaaaaaaaaaaaaaaaaaaaaaa:${id}`), { sort: 'hot' }).path).toBe(`/mix/did%3Aplc%3Aaaaaaaaaaaaaaaaaaaaaaaaa/${id}`)
  })
  it('does not expose credentials in publisher links', () => {
    for (const url of ['https://me:secret@site.example/rss', 'https://site.example/rss?feed_token=secret']) {
      expect(channelShare(channel(`feed:${url}`), { sort: 'hot' }).path).toBeUndefined()
    }
  })
  it('does not advertise a malformed published mix pointer', () => {
    expect(
      channelShare(channel('mix:3m2abcdefghij'), { sort: 'hot' }, [{ id: '3m2abcdefghij', name: 'Reading', sources: [], updatedAt: 0, published: 'at://not-a-did/io.paperwing.mix/not-a-key' }]).path,
    ).toBeUndefined()
  })
  it('routes profiles, boards, communities and Bluesky feeds to their own pages', () => {
    for (const address of [
      { kind: 'community' as const, name: 'science@lemmy.world' },
      { kind: 'bskyFeed' as const, uri: 'at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/app.bsky.feed.generator/science' },
    ]) {
      const id = channelId(address)
      expect(decodeURIComponent(channelShare(channel(id), { sort: 'hot' }).path!.split('?')[0].slice(3))).toBe(id)
    }
    expect(channelShare(channel('u:reader.example'), { sort: 'hot' }).path).toBe('/u/reader.example?sort=hot')
    expect(channelShare(channel('cb:did:plc:aaaaaaaaaaaaaaaaaaaaaaaa:3m2abcdefghij'), { sort: 'hot' }).path).toBe('/c/did%3Aplc%3Aaaaaaaaaaaaaaaaaaaaaaaaa/3m2abcdefghij?sort=hot')
  })
})
