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
/** Accounts whose server isn't answering just now. */
const down = new Set<string>()

vi.mock('./frontpage.js', () => ({
  getRecord: vi.fn(async (uri: string) => {
    if (!(uri in records)) throw new Error('Upstream 400 for pds.example')
    if (unreachable.has(uri)) throw new Error('PDS timed out')
    return { uri, cid: 'c', value: records[uri] }
  }),
  handles: vi.fn(async () => new Map([[OWNER, 'owner.example']])),
  // A repo's own records in one collection, every page: what each moderator has hidden.
  listAllRecords: vi.fn(async (did: string, collection: string) => {
    if (down.has(did)) throw new Error('PDS timed out')
    return Object.entries(records)
      .filter(([uri]) => uri.startsWith(`at://${did}/${collection}/`))
      .map(([uri, value]) => ({ uri, cid: 'c', value }))
  }),
  pool: async <T, R>(items: T[], _n: number, fn: (t: T) => Promise<R>) => Promise.all(items.map((i) => fn(i).catch(() => undefined))),
}))
vi.mock('./atlinks.js', () => ({
  linking: vi.fn(async () => []),
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
// Links to an address, by Constellation: every board (as many pages as there are), and each
// board's listings, whose record keys say when they were made.
const linkTargets: Record<string, string[]> = {}
/** Addresses Constellation isn't answering for just now. */
const failing: Record<string, true> = {}
vi.mock('./paperwing.js', () => ({
  official: (did: string) => did === 'did:plc:eprq6bm2okrgk6zsoka2wpux',
  // Honours its limit, like Constellation's pager: a smaller one would miss boards.
  linksTo: vi.fn(async (target: string, _c?: string, _p?: string, max = 300) => {
    if (target in failing) throw new Error('Constellation timed out')
    return (linkTargets[target] ?? []).slice(0, max)
  }),
  // As the real one reads it: PAPERWING_BLOCKED, DIDs or at:// URIs.
  blocked: () => new Set((process.env.PAPERWING_BLOCKED ?? '').split(/[\s,]+/).filter(Boolean)),
  unlisted: () => false,
  rank: (list: PostView[]) => list,
  submissions: vi.fn(async () => [`at://${ANN}/io.paperwing.submission/1`, `at://${ANN}/io.paperwing.submission/2`, `at://${ANN}/io.paperwing.submission/3`, `at://${BOB}/io.paperwing.submission/1`]),
}))
vi.mock('./http.js', () => ({ fetchJson: vi.fn(async () => ({ items: [{ subject: { did: BOB } }] })) }))

const { allBoards, boardFront } = await import('./boards.js')
const { tid } = await import('../../src/lib/mixes.js')
const { submissions } = await import('./paperwing.js')
const { listAllRecords } = await import('./frontpage.js')
const { fetchJson } = await import('./http.js')

describe('community boards', () => {
  // Boards are kept in the store for a minute: what's asked after a failure must not be what the failure built.
  memoryStore()
  afterEach(() => (unreachable.clear(), down.clear()))

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
    ["a moderator's hides", () => down.add(MOD)],
    ['the block list', () => vi.mocked(fetchJson).mockRejectedValueOnce(new Error('AppView is down'))],
  ]
  it.each(moderationDown)("fails, rather than showing what's kept off, when %s can't be read", async (_, breakIt) => {
    breakIt()
    await expect(boardFront(OWNER, 'bbbbbbbbbbbbb', 'hot')).rejects.toThrow()
    unreachable.clear()
    down.clear()
    const { stories } = await boardFront(OWNER, 'bbbbbbbbbbbbb', 'hot')
    expect(stories.map((s) => s.title)).toEqual(['aaaaaaaaaaaaa'])
  })

  it('is not served at all once PaperWing keeps the board, or its owner, off its pages', async () => {
    for (const off of [OWNER, `at://${OWNER}/io.paperwing.board/bbbbbbbbbbbbb`]) {
      process.env.PAPERWING_BLOCKED = off
      try {
        await expect(boardFront(OWNER, 'bbbbbbbbbbbbb', 'hot')).rejects.toThrow(/isn’t on PaperWing/)
      } finally {
        delete process.env.PAPERWING_BLOCKED
      }
    }
  })

  it('says which of its listings are on PaperWing’s front page too', async () => {
    expect((await boardFront(OWNER, 'bbbbbbbbbbbbb', 'hot')).stories[0].onFront).toBeUndefined()
    const key = `at://${ANN}/io.paperwing.submission/1`
    const before = records[key]
    records[key] = { ...(before as object), front: true }
    try {
      const { resetMemoryKv } = await import('./kv.js')
      resetMemoryKv()
      expect((await boardFront(OWNER, 'bbbbbbbbbbbbb', 'hot')).stories[0].onFront).toBe(true)
    } finally {
      records[key] = before
    }
  })

  it('reads hides from the moderators themselves: however many strangers add their own, none count and none get in the way', async () => {
    vi.mocked(listAllRecords).mockClear()
    for (let i = 0; i < 1500; i++) records[`at://${STRANGER}/io.paperwing.boardhide/j${i}`] = { board: BOARD, subject: post(ANN, 'aaaaaaaaaaaaa'), createdAt: '2026-11-01T00:00:00Z' }
    const { stories } = await boardFront(OWNER, 'bbbbbbbbbbbbb', 'hot')
    expect(stories.map((s) => s.title)).toEqual(['aaaaaaaaaaaaa'])
    expect(
      vi
        .mocked(listAllRecords)
        .mock.calls.map(([did]) => did)
        .sort(),
    ).toEqual([MOD, OWNER].sort())
  })

  it('a block list its owner deleted keeps nobody out, rather than taking the board down', async () => {
    vi.mocked(fetchJson).mockRejectedValueOnce(new Error('Upstream 400 for public.api.bsky.app'))
    const { stories } = await boardFront(OWNER, 'bbbbbbbbbbbbb', 'hot')
    expect(stories.map((s) => s.title).sort()).toEqual(['aaaaaaaaaaaaa', 'bbbbbbbbbbbbb'])
  })

  it('a block list that stops answering partway through fails the board, rather than letting the rest in', async () => {
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({ items: [{ subject: { did: 'did:plc:x' } }], cursor: 'next' })
      .mockRejectedValueOnce(new Error('Upstream 400 for public.api.bsky.app'))
    await expect(boardFront(OWNER, 'bbbbbbbbbbbbb', 'hot')).rejects.toThrow()
  })

  it('a block list longer than it will read fails the board, rather than letting the rest in', async () => {
    vi.mocked(fetchJson).mockResolvedValue({ items: [{ subject: { did: 'did:plc:x' } }], cursor: 'more' })
    await expect(boardFront(OWNER, 'bbbbbbbbbbbbb', 'hot')).rejects.toThrow(/More than/)
    vi.mocked(fetchJson).mockReset()
    vi.mocked(fetchJson).mockImplementation(async () => ({ items: [{ subject: { did: BOB } }] }))
  })

  it('lists every board, official ones marked, with how many people posted to each this week', async () => {
    const NEWS_OWNER = 'did:plc:eprq6bm2okrgk6zsoka2wpux'
    const news = `at://${NEWS_OWNER}/io.paperwing.board/3announcement`
    records[news] = { name: 'Announcements', moderators: [], site: 'https://paperwing.io', createdAt: '2026-11-01T00:00:00Z' }
    const extra = Array.from({ length: 120 }, (_, i) => `at://${STRANGER}/io.paperwing.board/${tid((Date.now() - i * 1000) * 1000)}`)
    for (const u of extra) records[u] = { name: `Board ${u.slice(-4)}`, moderators: [], site: 'https://paperwing.io', createdAt: '2026-10-01T00:00:00Z' }
    linkTargets['https://paperwing.io'] = [BOARD, news, ...extra]
    const day = 86_400_000
    const at = (msAgo: number) => `at://${ANN}/io.paperwing.submission/${tid((Date.now() - msAgo) * 1000)}`
    const by = (did: string, msAgo: number) => `at://${did}/io.paperwing.submission/${tid((Date.now() - msAgo) * 1000)}`
    // Two listings from one person count once; a nine-day-old one, a key dated next week and a key
    // that isn't a date don't count at all.
    linkTargets[`https://paperwing.io/c/${OWNER}/bbbbbbbbbbbbb`] = [at(1 * day), at(2 * day), by(BOB, day), at(9 * day), by(MOD, -7 * day), `at://${STRANGER}/io.paperwing.submission/notatimestamp`]
    // On the official board only its moderators count: anyone else's listings never show there.
    linkTargets[`https://paperwing.io/c/${NEWS_OWNER}/3announcement`] = [by(STRANGER, day), by(BOB, day)]
    const boards = await allBoards()
    expect(boards).toHaveLength(122)
    expect(boards.find((b) => b.uri === BOARD)).toMatchObject({ active: 2, official: false })
    expect(boards.find((b) => b.uri === news)).toMatchObject({ active: 0, official: true })
    // When a board's listings can't be counted, it says nothing rather than "quiet".
    failing[`https://paperwing.io/c/${OWNER}/bbbbbbbbbbbbb`] = true
    expect((await allBoards()).find((b) => b.uri === BOARD)?.active).toBeUndefined()
    delete failing[`https://paperwing.io/c/${OWNER}/bbbbbbbbbbbbb`]
    for (const u of extra) delete records[u]
    delete records[news]
  })

  it('on a board where only moderators post, keeps only its moderators’ listings', async () => {
    const before = records[BOARD]
    records[BOARD] = { ...(before as object), modsOnly: true }
    records[`at://${MOD}/io.paperwing.submission/9`] = sub(MOD, 'mmmmmmmmmmmmm', BOARD)
    vi.mocked(submissions).mockResolvedValueOnce([`at://${ANN}/io.paperwing.submission/1`, `at://${MOD}/io.paperwing.submission/9`])
    const { stories } = await boardFront(OWNER, 'bbbbbbbbbbbbb', 'new')
    expect(stories.map((s) => s.title)).toEqual(['mmmmmmmmmmmmm'])
    records[BOARD] = before
    delete records[`at://${MOD}/io.paperwing.submission/9`]
  })
})
