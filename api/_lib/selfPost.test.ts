import { beforeEach, describe, expect, it, vi } from 'vitest'
import { storyKey } from '../../src/lib/storyKey.js'
import { memoryStore } from '../_test/harness.js'

// A self post's body as the server sees it: read from its author's repo, with every version it has
// seen kept, oldest first. Faked at the edge: the author's repo.
const DID = 'did:plc:uuuuuuuuuuuuuuuuuuuuuuuu'
const POST = `at://${DID}/app.bsky.feed.post/3m2abcdefghij`
const SUB = `at://${DID}/io.paperwing.submission/3m2abcdefghij`
const KEY = storyKey({ kind: 'bs', uri: POST })

let repo: Record<string, { cid: string; value: unknown }> = {}
const written = (body: string, cid: string, post = POST) => {
  repo[SUB] = {
    cid,
    value: { post: { uri: post, cid: 'p' }, url: 'https://paperwing.io/t/paperwing/x', title: 'Ask PaperWing', body, site: 'https://paperwing.io', createdAt: '2026-11-02T10:00:00Z' },
  }
}
const reads = vi.fn()

vi.mock('./frontpage.js', () => ({
  getRecord: vi.fn(async (uri: string) => {
    reads(uri)
    const r = repo[uri]
    if (!r) throw new Error('Upstream 400 for pds.example')
    return { uri, ...r }
  }),
}))

const { selfPostBody, VERSIONS_KEPT } = await import('./selfPost.js')

memoryStore()
beforeEach(() => {
  repo = {}
  reads.mockClear()
  delete process.env.PAPERWING_BLOCKED
})

const t0 = Date.parse('2026-11-02T10:00:00Z')
const minutes = (n: number) => t0 + n * 60_000

describe('a self post’s body', () => {
  it('is read from its author’s repo, at the post’s own key', async () => {
    written('Hello **world**', 'v1')
    const got = await selfPostBody(KEY, t0)
    expect(got.body).toBe('Hello **world**')
    expect(got.versions).toEqual([{ body: 'Hello **world**', seenAt: t0 }])
    expect(reads).toHaveBeenCalledWith(SUB)
  })

  it('is asked for again at most once a minute', async () => {
    written('one', 'v1')
    await selfPostBody(KEY, t0)
    written('two', 'v2')
    expect((await selfPostBody(KEY, minutes(0.5))).body).toBe('one')
    expect((await selfPostBody(KEY, minutes(2))).body).toBe('two')
    expect(reads).toHaveBeenCalledTimes(2)
  })

  it('keeps each version it sees, with when it first saw it', async () => {
    written('first', 'v1')
    await selfPostBody(KEY, t0)
    await selfPostBody(KEY, minutes(2))
    written('second', 'v2')
    const got = await selfPostBody(KEY, minutes(5))
    expect(got.body).toBe('second')
    expect(got.versions).toEqual([
      { body: 'first', seenAt: t0 },
      { body: 'second', seenAt: minutes(5) },
    ])
  })

  it('keeps the original and the newest few, however often it’s edited', async () => {
    for (let i = 0; i < VERSIONS_KEPT + 5; i++) {
      written(`v${i}`, `c${i}`)
      await selfPostBody(KEY, minutes(i * 2))
    }
    const { versions } = await selfPostBody(KEY, minutes(1000))
    expect(versions).toHaveLength(VERSIONS_KEPT)
    expect(versions[0].body).toBe('v0')
    expect(versions.at(-1)!.body).toBe(`v${VERSIONS_KEPT + 4}`)
  })

  it('belongs only to its own post: a record pointing anywhere else is no body', async () => {
    written('not mine', 'v1', `at://${DID}/app.bsky.feed.post/3m2zzzzzzzzzz`)
    await expect(selfPostBody(KEY, t0)).rejects.toThrow(/self post/)
  })

  it('is no body without one: a link listing, or nothing there at all', async () => {
    written('', 'v1')
    await expect(selfPostBody(KEY, t0)).rejects.toThrow(/self post/)
    repo = {}
    await expect(selfPostBody(KEY, t0)).rejects.toThrow()
  })

  it('is never read for anything but a Bluesky post, or for a blocked account', async () => {
    await expect(selfPostBody('hn-123', t0)).rejects.toThrow(/self post/)
    written('spam', 'v1')
    process.env.PAPERWING_BLOCKED = DID
    await expect(selfPostBody(KEY, t0)).rejects.toThrow(/removed/)
    expect(reads).not.toHaveBeenCalled()
  })
})
