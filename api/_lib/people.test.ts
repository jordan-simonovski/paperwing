import { describe, expect, it, vi } from 'vitest'
import type { PostView } from './bsky.js'

const ME = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
const OTHER = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb'
const post = (did: string, id: string, likes: number, created: string): PostView =>
  ({
    uri: `at://${did}/app.bsky.feed.post/${id}`,
    cid: 'c',
    author: { did, handle: 'me.example' },
    record: { text: `Post ${id}`, createdAt: created },
    likeCount: likes,
    replyCount: 2,
    indexedAt: created,
  }) as PostView
const sub = (did: string, id: string, board?: string) => ({
  uri: `at://${ME}/io.paperwing.submission/${id}`,
  cid: 'c',
  value: {
    site: 'https://paperwing.io',
    post: { uri: `at://${did}/app.bsky.feed.post/${id}`, cid: 'c' },
    url: 'https://example.com/' + id,
    title: 'T ' + id,
    ...(board ? { board, boardUrl: `https://paperwing.io/b/${board}` } : {}),
    createdAt: '2026-11-01T00:00:00Z',
  },
})

vi.mock('./http.js', () => ({
  fetchJson: vi.fn(async () => ({ did: ME, handle: 'me.example', displayName: 'Me', description: 'Hello', followersCount: 12 })),
}))
vi.mock('./frontpage.js', () => ({
  listRecords: vi.fn(async (_did: string, collection: string) =>
    collection === 'io.paperwing.submission'
      ? [sub(ME, 'aaaaaaaaaaaab', 'business'), sub(ME, 'aaaaaaaaaaaac'), sub(OTHER, 'aaaaaaaaaaaad')]
      : [{ uri: `at://${ME}/io.paperwing.mix/m1`, cid: 'c', value: { name: 'My mix', sources: [{ kind: 'topic', id: 'ai' }], createdAt: '2026-11-01T00:00:00Z' } }],
  ),
}))
vi.mock('./atlinks.js', () => ({
  posts: vi.fn(async (uris: string[]) =>
    uris.map((u) => post(u.split('/')[2], u.split('/').pop()!, u.endsWith('aaaaaaaaaaaab') ? 5 : 3, u.endsWith('aaaaaaaaaaaab') ? '2026-11-01T01:00:00Z' : '2026-11-01T05:00:00Z')),
  ),
}))

const { actorOf, person } = await import('./people.js')

describe('profiles', () => {
  it('accepts handles and DIDs, nothing else', () => {
    expect(actorOf('@Me.Example')).toBe('me.example')
    expect(actorOf(ME)).toBe(ME)
    expect(actorOf('not a handle')).toBeUndefined()
    expect(actorOf('../etc')).toBeUndefined()
  })
  it('lists only their own posts, newest first, with boards, mixes and totals', async () => {
    const p = await person('me.example')
    expect(p.profile).toMatchObject({ did: ME, handle: 'me.example', name: 'Me', bio: 'Hello', followers: 12 })
    expect(p.stories.map((s) => s.title)).toEqual(['Post aaaaaaaaaaaac', 'Post aaaaaaaaaaaab'])
    expect(p.stories[1].tags).toEqual(['business'])
    expect(p.stories.every((s) => s.sourceLabel === 'PaperWing')).toBe(true)
    expect(p.mixes).toEqual([{ uri: `at://${ME}/io.paperwing.mix/m1`, rkey: 'm1', name: 'My mix', description: undefined, sources: 1 }])
    expect(p.totals).toEqual({ listed: 2, votes: 8, comments: 4 })
  })
})
