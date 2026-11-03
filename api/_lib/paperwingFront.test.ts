import { afterEach, describe, expect, it, vi } from 'vitest'
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
const SLOWPOKE = 'did:plc:wwwwwwwwwwwwwwwwwwwwwwww'
const SLOW = `at://${SLOWPOKE}/io.paperwing.board/3slowboardxxx`
const KEPT_OUT = 'did:plc:kkkkkkkkkkkkkkkkkkkkkkkk'
const BLOCK_LIST = `at://${USER}/app.bsky.graph.list/3blocklistxxx`
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
  // Someone the board's block list keeps out.
  listing(KEPT_OUT, 'keptout', { community: KITCHEN, boardUrl: `https://paperwing.io/c/${USER}/3kitchenboard`, front: true }),
  // A board whose moderator's server never answers.
  listing(OTHER, 'slowboard', { community: SLOW, boardUrl: `https://paperwing.io/c/${SLOWPOKE}/3slowboardxxx`, front: true }),
]
const base = records.length
/** How many hours ago each listing's post was made (an hour, unless it says). */
const ages: Record<string, number> = {}
const hides: Record<string, unknown[]> = {
  [USER]: [{ uri: `at://${USER}/io.paperwing.boardHide/1`, value: { board: KITCHEN, subject: `at://${OTHER}/app.bsky.feed.post/3posthiddenon`, createdAt: hoursAgo(1) } }],
}
const boards: Record<string, unknown> = {
  [KITCHEN]: { name: 'Home Cooking', moderators: [], blockList: BLOCK_LIST, createdAt: hoursAgo(100) },
  [NEWS]: { name: 'Announcements', moderators: [], createdAt: hoursAgo(100) },
  [SHAKY]: { name: 'Shaky', moderators: [], createdAt: hoursAgo(100) },
  [SLOW]: { name: 'Slow', moderators: [], createdAt: hoursAgo(100) },
}
/** Listings whose posts carry pictures. */
const pictured = new Set<string>()
/** Listings whose posts their authors put a content warning on. */
const selfLabelled = new Set<string>()
const likes: Record<string, number> = { plain: 50, boardfront: 20, news: 0, boardonly: 90, fakenews: 500, hiddenone: 400, unmoderated: 300, keptout: 600, slowboard: 700 }

vi.mock('./http.js', async (orig) => ({
  ...(await orig<typeof import('./http.js')>()),
  fetchJson: vi.fn(async (url: string) =>
    url.includes('app.bsky.graph.getList')
      ? { items: [{ subject: { did: KEPT_OUT } }] }
      : { linking_records: records.map((r) => ({ did: r.uri.split('/')[2], collection: 'io.paperwing.submission', rkey: r.uri.split('/')[4] })), cursor: null },
  ),
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
    if (did === SLOWPOKE) return new Promise(() => {})
    return hides[did] ?? []
  }),
  pool: async <T, R>(items: T[], _n: number, fn: (t: T) => Promise<R>) => Promise.all(items.map((i) => fn(i).catch(() => undefined))),
}))
vi.mock('./atlinks.js', () => ({
  posts: vi.fn(async (uris: string[]) =>
    uris.map((u) => {
      const n = records.find((r) => (r.value.post as { uri: string }).uri === u)!.value.title as string
      return {
        uri: u,
        cid: 'c',
        author: { did: u.split('/')[2], handle: 'h' },
        record: { text: n, createdAt: hoursAgo(ages[n] ?? 1) },
        ...(pictured.has(n) ? { embed: { $type: 'app.bsky.embed.images#view', images: [{ thumb: 't', fullsize: 'f', alt: 'A picture' }] } } : {}),
        ...(selfLabelled.has(n) ? { labels: [{ src: u.split('/')[2], uri: u, val: 'nudity' }] } : {}),
        likeCount: likes[n] ?? 0,
        replyCount: 0,
        indexedAt: hoursAgo(ages[n] ?? 1),
      } as PostView
    }),
  ),
}))

process.env.PAPERWING_OFFICIAL = OFFICIAL
const { paperwingFront } = await import('./paperwing.js')

describe('the PaperWing front page', () => {
  memoryStore()
  afterEach(() => {
    records.splice(base)
    for (const k of Object.keys(ages)) delete ages[k]
    vi.useRealTimers()
  })
  /** The front page, with the clock run on past any moderation it's waiting for. */
  const front = async (sort: 'hot' | 'new' | 'top') => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const out = paperwingFront(sort, undefined, now)
    await vi.advanceTimersByTimeAsync(5000)
    return out
  }

  it('has board listings only when their poster put them there too, each saying which board', async () => {
    const stories = await front('new')
    expect(stories.map((s) => s.title).sort()).toEqual(['boardfront', 'news', 'plain'])
    // Newest first means newest first: nothing is pinned.
    expect(stories.some((s) => s.pinned)).toBe(false)
    expect(stories.find((s) => s.title === 'boardfront')?.board).toEqual({ uri: KITCHEN, name: 'Home Cooking', official: false })
    expect(stories.find((s) => s.title === 'plain')?.board).toBeUndefined()
  })

  it('keeps a post its author put a content warning on off the front page', async () => {
    selfLabelled.add('plain')
    try {
      ;(await import('./kv.js')).resetMemoryKv()
      expect((await front('new')).map((s) => s.title)).not.toContain('plain')
    } finally {
      selfLabelled.clear()
    }
  })

  it('keeps a picture post off the front page when its board takes no pictures', async () => {
    pictured.add('boardfront')
    const before = boards[KITCHEN]
    try {
      expect((await front('new')).map((s) => s.title)).toContain('boardfront')
      boards[KITCHEN] = { ...(before as object), noImages: true }
      ;(await import('./kv.js')).resetMemoryKv()
      expect((await front('new')).map((s) => s.title)).not.toContain('boardfront')
    } finally {
      pictured.clear()
      boards[KITCHEN] = before
    }
  })

  it('marks an official board’s listing, and keeps its newest at the top for a few days', async () => {
    const stories = await front('hot')
    expect(stories[0]).toMatchObject({ title: 'news', board: { name: 'Announcements', official: true }, pinned: true })
    expect(stories.filter((s) => s.pinned)).toHaveLength(1)
  })

  it('keeps what a board’s moderators hid, and its block list, off the front page as well', async () => {
    const titles = (await front('hot')).map((s) => s.title)
    expect(titles).toContain('boardfront')
    expect(titles).not.toContain('hiddenone')
    expect(titles).not.toContain('keptout')
  })

  it('leaves out a board’s listings while its moderation can’t be read, rather than show them unmoderated', async () => {
    const titles = (await front('top')).map((s) => s.title)
    expect(titles).not.toContain('unmoderated')
    expect(titles).toContain('plain')
  })

  it('doesn’t wait on a board whose moderators’ server is slow: it leaves that board out', async () => {
    const titles = (await front('hot')).map((s) => s.title)
    expect(titles).not.toContain('slowboard')
    expect(titles).toContain('boardfront')
  })

  it('pins the announcement however many listings outrank it, and keeps the page to 80', async () => {
    for (let i = 0; i < 100; i++) {
      const n = `busy${'abcdefghij'[Math.floor(i / 10)]}${'abcdefghij'[i % 10]}aa`
      records.push(listing(USER, n, {}))
      likes[n] = 1000
    }
    const stories = await front('top')
    expect(stories[0]).toMatchObject({ title: 'news', pinned: true })
    expect(stories).toHaveLength(80)
  })

  it('stops pinning an announcement after three days, and pins the newest of several', async () => {
    ages.news = 96
    expect((await front('hot')).some((s) => s.pinned)).toBe(false)
    records.push(listing(OFFICIAL, 'newer', { community: NEWS, boardUrl: `https://paperwing.io/c/${OFFICIAL}/3announcement`, front: true }))
    records.push(listing(OFFICIAL, 'older', { community: NEWS, boardUrl: `https://paperwing.io/c/${OFFICIAL}/3announcement`, front: true }))
    ages.newer = 2
    ages.older = 30
    const stories = await front('top')
    expect(stories.filter((s) => s.pinned).map((s) => s.title)).toEqual(['newer'])
  })
})
