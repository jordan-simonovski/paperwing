import { describe, expect, it, vi } from 'vitest'
import type { PostView } from './bsky.js'

const OWNER = 'did:plc:oooooooooooooooooooooooo'
const MOD = 'did:plc:mmmmmmmmmmmmmmmmmmmmmmmm'
const STRANGER = 'did:plc:ssssssssssssssssssssssss'
const ANN = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
const BOB = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb'
const BOARD = `at://${OWNER}/io.paperwing.board/bbbbbbbbbbbbb`
const OTHER_BOARD = `at://${OWNER}/io.paperwing.board/ccccccccccccc`
const post = (did: string, rkey: string) => `at://${did}/app.bsky.feed.post/${rkey}`
const sub = (did: string, rkey: string, community: string) => ({
  post: { uri: post(did, rkey), cid: 'c' },
  url: `https://example.com/${rkey}`,
  title: rkey,
  community,
  site: 'https://paperwing.io',
  createdAt: '2026-11-01T00:00:00Z',
})

const records: Record<string, unknown> = {
  [BOARD]: { name: 'Home Cooking', moderators: [MOD], blockList: `at://${OWNER}/app.bsky.graph.list/3kblock`, site: 'https://paperwing.io', createdAt: '2026-11-01T00:00:00Z' },
  [`at://${ANN}/io.paperwing.submission/1`]: sub(ANN, 'aaaaaaaaaaaaa', BOARD),
  [`at://${ANN}/io.paperwing.submission/2`]: sub(ANN, 'aaaaaaaaaaaab', BOARD),
  [`at://${ANN}/io.paperwing.submission/3`]: sub(ANN, 'aaaaaaaaaaaac', OTHER_BOARD),
  [`at://${BOB}/io.paperwing.submission/1`]: sub(BOB, 'bbbbbbbbbbbbb', BOARD),
  [`at://${MOD}/io.paperwing.boardhide/1`]: { board: BOARD, subject: post(ANN, 'aaaaaaaaaaaab'), createdAt: '2026-11-01T00:00:00Z' },
  [`at://${STRANGER}/io.paperwing.boardhide/1`]: { board: BOARD, subject: post(ANN, 'aaaaaaaaaaaaa'), createdAt: '2026-11-01T00:00:00Z' },
}

vi.mock('./frontpage.js', () => ({
  getRecord: vi.fn(async (uri: string) => {
    if (!(uri in records)) throw new Error('gone')
    return { uri, cid: 'c', value: records[uri] }
  }),
  handles: vi.fn(async () => new Map([[OWNER, 'owner.example']])),
  pool: async <T, R>(items: T[], _n: number, fn: (t: T) => Promise<R>) => Promise.all(items.map((i) => fn(i).catch(() => undefined))),
}))
vi.mock('./atlinks.js', () => ({
  linking: vi.fn(async (_target: string, collection: string) => (collection === 'io.paperwing.boardhide' ? [`at://${MOD}/io.paperwing.boardhide/1`, `at://${STRANGER}/io.paperwing.boardhide/1`] : [])),
  posts: vi.fn(async (uris: string[]) =>
    uris.map(
      (u) =>
        ({
          uri: u,
          cid: 'c',
          author: { did: u.split('/')[2], handle: 'x' },
          record: { text: u.split('/').pop(), createdAt: '2026-11-01T00:00:00Z' },
          likeCount: 1,
          replyCount: 0,
          indexedAt: '2026-11-01T00:00:00Z',
        }) as PostView,
    ),
  ),
}))
vi.mock('./paperwing.js', () => ({
  blocked: () => new Set<string>(),
  unlisted: () => false,
  rank: (list: PostView[]) => list,
  submissions: vi.fn(async () => [`at://${ANN}/io.paperwing.submission/1`, `at://${ANN}/io.paperwing.submission/2`, `at://${ANN}/io.paperwing.submission/3`, `at://${BOB}/io.paperwing.submission/1`]),
}))
vi.mock('./http.js', () => ({ fetchJson: vi.fn(async () => ({ items: [{ subject: { did: BOB } }] })) }))
vi.mock('./kv.js', () => ({ kvConfigured: () => false, kv: () => ({}) }))

const { boardFront } = await import('./boards.js')

describe('community boards', () => {
  it('lists its own listings, minus what its moderators hid and the accounts it keeps out', async () => {
    const { board, stories } = await boardFront(OWNER, 'bbbbbbbbbbbbb', 'hot')
    expect(board.name).toBe('Home Cooking')
    // Ann's first stays (only a stranger tried to hide it), her second was hidden by a moderator,
    // her third was for another board, and Bob is on the board's block list.
    expect(stories.map((s) => s.title)).toEqual(['aaaaaaaaaaaaa'])
    expect(stories[0].sourceLabel).toBe('Home Cooking')
  })
})
