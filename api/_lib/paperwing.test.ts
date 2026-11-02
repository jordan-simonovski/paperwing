import { describe, expect, it } from 'vitest'
import { cleanSubmission, submissionRecord } from '../../src/lib/paperwing.js'
import type { PostView } from './bsky.js'
import { blocked, rank } from './paperwing.js'

const now = Date.parse('2026-11-01T12:00:00Z')
const post = (id: string, hoursAgo: number, likes: number, replies = 0): PostView =>
  ({
    uri: `at://did:plc:x/app.bsky.feed.post/${id}`,
    cid: 'c',
    author: { did: 'did:plc:x', handle: 'x' },
    record: { text: id, createdAt: new Date(now - hoursAgo * 3_600_000).toISOString() },
    likeCount: likes,
    replyCount: replies,
    indexedAt: new Date(now - hoursAgo * 3_600_000).toISOString(),
  }) as PostView

describe('PaperWing front page', () => {
  it('ranks like HN: engagement over age, with gravity', () => {
    const list = [post('old-big', 30, 200), post('fresh-small', 1, 12), post('fresh-talked', 2, 5, 10), post('ancient', 24 * 9, 900)]
    expect(rank(list, 'hot', now).map((p) => p.record.text)[0]).toBe('fresh-talked')
    expect(rank(list, 'new', now).map((p) => p.record.text)).toEqual(['fresh-small', 'fresh-talked', 'old-big', 'ancient'])
    expect(rank(list, 'top', now).map((p) => p.record.text)).toEqual(['old-big', 'fresh-talked', 'fresh-small'])
  })
  it('only trusts well-formed submissions', () => {
    const good = {
      post: { uri: 'at://did:plc:ukwly4246zmbi537o4u36pff/app.bsky.feed.post/3m2abcdefghij', cid: 'c' },
      url: 'https://a.example/x',
      title: 'T',
      board: 'space',
      site: 'https://paperwing.io',
    }
    expect(cleanSubmission(good)?.boardUrl).toBe('https://paperwing.io/b/space')
    expect(cleanSubmission({ ...good, board: 'nope' })?.board).toBeUndefined()
    expect(cleanSubmission({ ...good, url: 'javascript:alert(1)' })).toBeUndefined()
    expect(cleanSubmission({ ...good, post: { uri: 'at://did:plc:x/app.bsky.feed.like/abc', cid: 'c' } })).toBeUndefined()
  })
})

describe('a listing on a community board', () => {
  const ref = { uri: 'at://did:plc:ukwly4246zmbi537o4u36pff/app.bsky.feed.post/3m2abcdefghij', cid: 'c' }
  const BOARD = 'at://did:plc:ukwly4246zmbi537o4u36pff/io.paperwing.board/3m2abcdefghij'

  it('stays on its board unless its poster also puts it on the front page', () => {
    expect(cleanSubmission(submissionRecord(ref, 'https://a.example/x', 'T', BOARD))).toMatchObject({ community: BOARD })
    expect(cleanSubmission(submissionRecord(ref, 'https://a.example/x', 'T', BOARD))?.front).toBeUndefined()
    expect(cleanSubmission(submissionRecord(ref, 'https://a.example/x', 'T', BOARD, { front: true }))?.front).toBe(true)
  })

  it('only a board listing can ask for the front page: everything else is on it already', () => {
    expect(submissionRecord(ref, 'https://a.example/x', 'T', 'space', { front: true })).not.toHaveProperty('front')
    expect(cleanSubmission({ ...submissionRecord(ref, 'https://a.example/x', 'T', 'space'), front: true })?.front).toBeUndefined()
    expect(cleanSubmission({ ...submissionRecord(ref, 'https://a.example/x', 'T', BOARD), front: 'yes' })?.front).toBeUndefined()
  })
})

describe('PaperWing blocklist', () => {
  it('reads DIDs and post URIs, ignoring anything else', () => {
    const b = blocked('did:plc:spam, at://did:plc:x/app.bsky.feed.post/abc\n  nonsense  did:web:bad.example')
    expect([...b].sort()).toEqual(['at://did:plc:x/app.bsky.feed.post/abc', 'did:plc:spam', 'did:web:bad.example'])
    expect(blocked('').size).toBe(0)
  })
})
