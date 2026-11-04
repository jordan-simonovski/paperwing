import { afterEach, describe, expect, it, vi } from 'vitest'
import { SOURCES } from '../../../api/feed'
import type { FeedRef } from '../topics'
import { FEED_KINDS, feedBrand, feedId, feedLabel, feedMark, fetchFeed, newestOf } from './kinds'

// The feed kind table, tested through its interface. SAMPLES is typed over every kind, so a new
// kind won't compile until it has samples here, and then every rule below applies to it.

type Ref<K extends FeedRef['kind']> = Extract<FeedRef, { kind: K }>
const SAMPLES: { [K in FeedRef['kind']]: Ref<K>[] } = {
  hn: [
    { kind: 'hn', list: 'top' },
    { kind: 'hn', list: 'ask' },
  ],
  hnSearch: [{ kind: 'hnSearch', query: 'opentelemetry' }],
  lobsters: [
    { kind: 'lobsters', path: 'hottest' },
    { kind: 'lobsters', path: 't/rust,go' },
  ],
  devto: [{ kind: 'devto', tag: 'rust' }],
  rss: [
    { kind: 'rss', url: 'https://feeds.example.com/a.xml', label: 'Example A' },
    { kind: 'rss', url: 'https://example.org/b.xml', label: 'Example B' },
  ],
  standard: [{ kind: 'standard', url: 'https://writer.example', label: 'A writer' }],
  arxiv: [{ kind: 'arxiv', q: 'cat:cs.AI' }],
  hf: [{ kind: 'hf' }],
  github: [{ kind: 'github', q: 'stars:>50' }],
  releases: [{ kind: 'releases', repos: ['grafana/grafana', 'open-telemetry/opentelemetry-collector'] }],
  bluesky: [
    { kind: 'bluesky', feed: 'tech' },
    { kind: 'bluesky', feed: 'following' },
  ],
  bskyFeed: [{ kind: 'bskyFeed', uri: 'at://did:plc:x/app.bsky.feed.generator/science', name: 'Science' }],
  frontpage: [{ kind: 'frontpage', feed: 'hot' }],
  lemmy: [{ kind: 'lemmy', community: 'science@lemmy.world', via: 'lemmy.world' }],
  mastodon: [
    { kind: 'mastodon', feed: 'trends' },
    { kind: 'mastodon', feed: 'tags', tags: ['science'] },
  ],
  news: [{ kind: 'news', q: 'sourdough' }],
  paperwing: [
    { kind: 'paperwing', sort: 'hot' },
    { kind: 'paperwing', sort: 'hot', board: 'open-web' },
  ],
  person: [{ kind: 'person', actor: 'did:plc:anil', label: '@anil.example' }],
  board: [{ kind: 'board', did: 'did:plc:mod', rkey: 'open-web', sort: 'hot', name: 'The Open Web' }],
  boardpicks: [{ kind: 'boardpicks' }],
  status: [{ kind: 'status' }, { kind: 'status', providers: ['github'], active: true }],
  warn: [{ kind: 'warn', state: 'ca' }],
}
const all = Object.values(SAMPLES).flat() as FeedRef[]

afterEach(() => vi.unstubAllGlobals())

describe('every kind of feed', () => {
  it('has a name, a brand and a logo', () => {
    for (const ref of all) {
      expect(feedLabel(ref), ref.kind).toBeTruthy()
      expect(feedBrand(ref), ref.kind).toBeTruthy()
      expect(feedMark(ref), ref.kind).toBeTruthy()
    }
  })

  it('has its own cache id: different feeds never share one', () => {
    const ids = all.map((ref) => feedId(ref))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps one account’s feeds apart from another’s', () => {
    const following = SAMPLES.bluesky[1]
    expect(feedId(following, { bluesky: { did: 'did:plc:a' } })).not.toBe(feedId(following, { bluesky: { did: 'did:plc:b' } }))
    const trends = SAMPLES.mastodon[0]
    expect(feedId(trends, { mastodon: { instance: 'hachyderm.io' } })).not.toBe(feedId(trends, { mastodon: { instance: 'mastodon.social' } }))
  })

  it('stays the same kind of feed in Latest', () => {
    for (const ref of all) expect(newestOf(ref).kind).toBe(ref.kind)
    expect(newestOf(SAMPLES.hn[0])).toEqual({ kind: 'hn', list: 'new' })
    expect(newestOf(SAMPLES.lemmy[0])).toMatchObject({ sort: 'New' })
  })

  it('asks the server only for sources the server has', async () => {
    const asked: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'https://paperwing.test')
        if (url.pathname === '/api/feed') asked.push(url.searchParams.get('src') ?? '')
        return new Response('[]', { headers: { 'content-type': 'application/json' } })
      }),
    )
    for (const ref of all) await fetchFeed(ref).catch(() => {})
    expect(asked.length).toBeGreaterThan(5)
    for (const src of asked) expect(Object.keys(SOURCES), src).toContain(src)
  })

  it('says which board each of a board’s posts is from', async () => {
    const board = { uri: 'at://did:plc:mod/io.paperwing.board/open-web', name: 'The Open Web', official: false }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ board, stories: [{ key: 'bs-1', title: 'A post' }] }), { headers: { 'content-type': 'application/json' } })),
    )
    const [story] = await fetchFeed(SAMPLES.board[0])
    expect(story.board).toEqual(board)
  })

  it('asks for board suggestions with nothing about the reader: everyone gets the same', async () => {
    let asked: URL | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        asked = new URL(String(input), 'https://paperwing.test')
        return new Response('[]', { headers: { 'content-type': 'application/json' } })
      }),
    )
    await fetchFeed({ kind: 'boardpicks' })
    expect([...asked!.searchParams.keys()]).toEqual(['src'])
  })

  it('is in the table', () => {
    expect(Object.keys(FEED_KINDS).sort()).toEqual(Object.keys(SAMPLES).sort())
  })
})
