import { describe, expect, it, vi } from 'vitest'
import { memoryStore } from '../_test/harness.js'
import type { PostView } from './bsky.js'

// The front page as the network has it: listings found through Constellation, records read from
// each poster's repo, posts from Bluesky. Faked at those edges.
const USER = 'did:plc:uuuuuuuuuuuuuuuuuuuuuuuu'
const OFFICIAL = 'did:plc:eprq6bm2okrgk6zsoka2wpux'
const KITCHEN = `at://${USER}/io.paperwing.board/3kitchenboard`
const NEWS = `at://${OFFICIAL}/io.paperwing.board/3announcement`
const OTHER = 'did:plc:oooooooooooooooooooooooo'
const DOWN = 'did:plc:dddddddddddddddddddddddd'
const SHAKY = `at://${DOWN}/io.paperwing.board/3shakyboardxx`
const now = Date.now()
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString()

const listing = (did: string, n: string, extra: Record<string, unknown>) => ({
  uri: `at://${did}/io.paperwing.submission/${n}`,
  value: {
    post: { uri: `at://${did}/app.bsky.feed.post/3post${n.slice(0, 8).padStart(8, 'a')}`, cid: 'c' },
    url: `https://example.com/${n}`,
    title: n,
    site: 'https://paperwing.io',
    createdAt: hoursAgo(1),
    ...extra,
  },
})
const records = [
  listing(USER, 'plain', {}),
  listing(USER, 'boardonly', { community: KITCHEN, boardUrl: `https://paperwing.io/c/${USER}/3kitchenboard` }),
  listing(USER, 'boardfront', { community: KITCHEN, boardUrl: `https://paperwing.io/c/${USER}/3kitchenboard`, front: true }),
  listing(OFFICIAL, 'news', { community: NEWS, boardUrl: `https://paperwing.io/c/${OFFICIAL}/3announcement`, front: true }),
  // Anyone can write a listing naming the official board; only its moderators' count.
  listing(USER, 'fakenews', { community: NEWS, boardUrl: `https://paperwing.io/c/${OFFICIAL}/3announcement`, front: true }),
  // Its moderator hid this one on the board, so it stays off the front page too.
  listing(OTHER, 'hiddenone', { community: KITCHEN, boardUrl: `https://paperwing.io/c/${USER}/3kitchenboard`, front: true }),
  // A board whose moderators' hides can't be read right now.
  listing(OTHER, 'unmoderated', { community: SHAKY, boardUrl: `https://paperwing.io/c/${DOWN}/3shakyboardxx`, front: true }),
]
const hides: Record<string, unknown[]> = {
  [USER]: [{ uri: `at://${USER}/io.paperwing.boardHide/1`, value: { board: KITCHEN, subject: `at://${OTHER}/app.bsky.feed.post/3posthiddenon`, createdAt: hoursAgo(1) } }],
}
const boards: Record<string, unknown> = {
  [KITCHEN]: { name: 'Home Cooking', moderators: [], createdAt: hoursAgo(100) },
  [NEWS]: { name: 'Announcements', moderators: [], createdAt: hoursAgo(100) },
  [SHAKY]: { name: 'Shaky', moderators: [], createdAt: hoursAgo(100) },
}
const likes: Record<string, number> = { plain: 50, boardfront: 20, news: 0, boardonly: 90, fakenews: 500, hiddenone: 400, unmoderated: 300 }

vi.mock('./http.js', async (orig) => ({
  ...(await orig<typeof import('./http.js')>()),
  fetchJson: vi.fn(async () => ({ linking_records: records.map((r) => ({ did: r.uri.split('/')[2], collection: 'io.paperwing.submission', rkey: r.uri.split('/')[4] })), cursor: null })),
}))
vi.mock('./frontpage.js', () => ({
  getRecord: vi.fn(async (uri: string) => {
    const r = records.find((x) => x.uri === uri)
    if (r) return { uri, cid: 'c', value: r.value }
    if (uri in boards) return { uri, cid: 'c', value: boards[uri] }
    throw new Error('Upstream 400 for pds.example')
  }),
  listAllRecords: vi.fn(async (did: string) => {
    if (did === DOWN) throw new Error('Upstream 502 for pds.example')
    return hides[did] ?? []
  }),
  pool: async <T, R>(items: T[], _n: number, fn: (t: T) => Promise<R>) => Promise.all(items.map((i) => fn(i).catch(() => undefined))),
}))
vi.mock('./atlinks.js', () => ({
  posts: vi.fn(async (uris: string[]) =>
    uris.map((u) => {
      const n = records.find((r) => (r.value.post as { uri: string }).uri === u)!.value.title as string
      return { uri: u, cid: 'c', author: { did: u.split('/')[2], handle: 'h' }, record: { text: n, createdAt: hoursAgo(1) }, likeCount: likes[n], replyCount: 0, indexedAt: hoursAgo(1) } as PostView
    }),
  ),
}))

process.env.PAPERWING_OFFICIAL = OFFICIAL
const { paperwingFront } = await import('./paperwing.js')

describe('the PaperWing front page', () => {
  memoryStore()

  it('has board listings only when their poster put them there too, each saying which board', async () => {
    const stories = await paperwingFront('new')
    expect(stories.map((s) => s.title).sort()).toEqual(['boardfront', 'news', 'plain'])
    expect(stories.find((s) => s.title === 'boardfront')?.board).toEqual({ uri: KITCHEN, name: 'Home Cooking', official: false })
    expect(stories.find((s) => s.title === 'plain')?.board).toBeUndefined()
  })

  it('marks an official board’s listing, and keeps its newest at the top for a few days', async () => {
    const stories = await paperwingFront('hot')
    expect(stories[0]).toMatchObject({ title: 'news', board: { name: 'Announcements', official: true }, pinned: true })
    expect(stories.filter((s) => s.pinned)).toHaveLength(1)
  })

  it('keeps what a board’s moderators hid, and its block list, off the front page as well', async () => {
    const titles = (await paperwingFront('hot')).map((s) => s.title)
    expect(titles).toContain('boardfront')
    expect(titles).not.toContain('hiddenone')
  })

  it('leaves out a board’s listings while its moderation can’t be read, rather than show them unmoderated', async () => {
    const titles = (await paperwingFront('top')).map((s) => s.title)
    expect(titles).not.toContain('unmoderated')
    expect(titles).toContain('plain')
  })
})
