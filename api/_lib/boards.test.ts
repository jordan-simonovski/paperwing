import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStore } from '../_test/harness.js'
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

/** Records whose server isn't answering just now. */
const unreachable = new Set<string>()

vi.mock('./frontpage.js', () => ({
  getRecord: vi.fn(async (uri: string) => {
    if (!(uri in records)) throw new Error('Upstream 400 for pds.example')
    if (unreachable.has(uri)) throw new Error('PDS timed out')
    return { uri, cid: 'c', value: records[uri] }
  }),
  handles: vi.fn(async () => new Map([[OWNER, 'owner.example']])),
  pool: async <T, R>(items: T[], _n: number, fn: (t: T) => Promise<R>) => Promise.all(items.map((i) => fn(i).catch(() => undefined))),
}))
vi.mock('./atlinks.js', () => ({
  linking: vi.fn(async () => []),
  // Every hide on the board, page by page.
  linkingAll: vi.fn(async () => [`at://${MOD}/io.paperwing.boardhide/1`, `at://${STRANGER}/io.paperwing.boardhide/1`]),
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

const { boardFront } = await import('./boards.js')
const { linkingAll } = await import('./atlinks.js')
const { fetchJson } = await import('./http.js')

describe('community boards', () => {
  // Boards are kept in the store for a minute: what's asked after a failure must not be what the failure built.
  memoryStore()
  afterEach(() => unreachable.clear())

  it('lists its own listings, minus what its moderators hid and the accounts it keeps out', async () => {
    const { board, stories } = await boardFront(OWNER, 'bbbbbbbbbbbbb', 'hot')
    expect(board.name).toBe('Home Cooking')
    // Ann's first stays (only a stranger tried to hide it), her second was hidden by a moderator,
    // her third was for another board, and Bob is on the board's block list.
    expect(stories.map((s) => s.title)).toEqual(['aaaaaaaaaaaaa'])
    expect(stories[0].sourceLabel).toBe('Home Cooking')
  })

  // When a moderation input can't be read, the board isn't served (or kept) without it: hidden
  // listings and kept-out accounts would come back, for everyone, for as long as it's cached.
  const moderationDown: [string, () => unknown][] = [
    ['the list of hides', () => vi.mocked(linkingAll).mockRejectedValueOnce(new Error('Constellation is down'))],
    ["a moderator's hide", () => unreachable.add(`at://${MOD}/io.paperwing.boardhide/1`)],
    ['the block list', () => vi.mocked(fetchJson).mockRejectedValueOnce(new Error('AppView is down'))],
  ]
  it.each(moderationDown)("fails, rather than showing what's kept off, when %s can't be read", async (_, breakIt) => {
    breakIt()
    await expect(boardFront(OWNER, 'bbbbbbbbbbbbb', 'hot')).rejects.toThrow()
    unreachable.clear()
    const { stories } = await boardFront(OWNER, 'bbbbbbbbbbbbb', 'hot')
    expect(stories.map((s) => s.title)).toEqual(['aaaaaaaaaaaaa'])
  })

  it('reads every hide, however many strangers have added their own', async () => {
    const junk = Array.from({ length: 300 }, (_, i) => `at://${STRANGER}/io.paperwing.boardhide/j${i}`)
    vi.mocked(linkingAll).mockResolvedValueOnce([...junk, `at://${MOD}/io.paperwing.boardhide/1`])
    const { stories } = await boardFront(OWNER, 'bbbbbbbbbbbbb', 'hot')
    expect(stories.map((s) => s.title)).toEqual(['aaaaaaaaaaaaa'])
  })

  it('a hide its moderator has since taken back counts as not hidden, rather than taking the board down', async () => {
    vi.mocked(linkingAll).mockResolvedValueOnce([`at://${MOD}/io.paperwing.boardhide/1`, `at://${MOD}/io.paperwing.boardhide/undone`])
    const { stories } = await boardFront(OWNER, 'bbbbbbbbbbbbb', 'hot')
    expect(stories.map((s) => s.title)).toEqual(['aaaaaaaaaaaaa'])
  })

  it('a block list its owner deleted keeps nobody out, rather than taking the board down', async () => {
    vi.mocked(fetchJson).mockRejectedValueOnce(new Error('Upstream 400 for public.api.bsky.app'))
    const { stories } = await boardFront(OWNER, 'bbbbbbbbbbbbb', 'hot')
    expect(stories.map((s) => s.title).sort()).toEqual(['aaaaaaaaaaaaa', 'bbbbbbbbbbbbb'])
  })
})
