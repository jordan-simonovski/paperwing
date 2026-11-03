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
const { kv } = await import('./kv.js')

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
    expect(got.editedAt).toBeUndefined()
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
    expect(got.editedAt).toBe(minutes(5))
  })

  it('keeps an earlier version for a day after it was replaced, and still says it was edited', async () => {
    written('first', 'v1')
    await selfPostBody(KEY, t0)
    written('second', 'v2')
    await selfPostBody(KEY, minutes(10))
    expect((await selfPostBody(KEY, minutes(10 + 23 * 60))).versions.map((v) => v.body)).toEqual(['first', 'second'])
    const later = await selfPostBody(KEY, minutes(10 + 25 * 60))
    expect(later.versions.map((v) => v.body)).toEqual(['second'])
    expect(later.editedAt).toBe(minutes(10))
    // And from the stored copy within the minute, too.
    expect((await selfPostBody(KEY, minutes(10 + 25 * 60 + 0.5))).editedAt).toBe(minutes(10))
  })

  it('still says a post was edited when its history was kept before edits were dated', async () => {
    written('second', 'v2')
    const old = {
      checkedAt: t0,
      cid: 'v2',
      versions: [
        { body: 'first', seenAt: t0 },
        { body: 'second', seenAt: minutes(5) },
      ],
    }
    await kv().set(`pw:self:${POST}`, JSON.stringify(old), 3600)
    const week = minutes(7 * 24 * 60)
    for (const at of [week, week + 30_000]) {
      const got = await selfPostBody(KEY, at)
      expect(got.versions.map((v) => v.body)).toEqual(['second'])
      expect(got.editedAt).toBe(minutes(5))
    }
  })

  it('still says a post was edited when nobody opened it for days: the edit is dated in its own record', async () => {
    written('second', 'v2')
    ;(repo[SUB].value as Record<string, unknown>).editedAt = '2026-11-02T10:05:00.000Z'
    const got = await selfPostBody(KEY, minutes(5 * 24 * 60))
    expect(got.versions).toHaveLength(1)
    expect(got.editedAt).toBe(Date.parse('2026-11-02T10:05:00.000Z'))
  })

  it('keeps its history when the account can’t be looked up, which isn’t the words being deleted', async () => {
    written('first', 'v1')
    await selfPostBody(KEY, t0)
    reads.mockImplementationOnce(() => {
      throw new Error('Upstream 400 for plc.directory')
    })
    await expect(selfPostBody(KEY, minutes(2))).rejects.toThrow(/plc/)
    expect(await kv().get(`pw:self:${POST}`)).not.toBeNull()
  })

  it('forgets every version once its words are deleted, but not when its server is only down', async () => {
    written('first', 'v1')
    await selfPostBody(KEY, t0)
    written('second', 'v2')
    await selfPostBody(KEY, minutes(2))

    const saved = repo[SUB]
    repo = {}
    reads.mockImplementationOnce(() => {
      throw new Error('Upstream 502 for pds.example')
    })
    await expect(selfPostBody(KEY, minutes(4))).rejects.toThrow(/502/)
    expect(await kv().get(`pw:self:${POST}`)).not.toBeNull()

    await expect(selfPostBody(KEY, minutes(6))).rejects.toThrow(/deleted/)
    expect(await kv().get(`pw:self:${POST}`)).toBeNull()
    // Written again later, it starts a new history: nothing from before comes back.
    repo[SUB] = saved
    expect((await selfPostBody(KEY, minutes(8))).versions.map((v) => v.body)).toEqual(['second'])
  })

  it('keeps the newest few, however often it’s edited', async () => {
    for (let i = 0; i < VERSIONS_KEPT + 5; i++) {
      written(`v${i}`, `c${i}`)
      await selfPostBody(KEY, minutes(i * 2))
    }
    const { versions } = await selfPostBody(KEY, minutes(1000))
    expect(versions).toHaveLength(VERSIONS_KEPT)
    expect(versions[0].body).toBe('v5')
    expect(versions.at(-1)!.body).toBe(`v${VERSIONS_KEPT + 4}`)
  })

  it('never loses its history to a store that fails to answer', async () => {
    written('first', 'v1')
    await selfPostBody(KEY, t0)
    written('second', 'v2')
    await selfPostBody(KEY, minutes(2))
    // One failed read (a timeout, an outage), then one that returns garbage: neither may overwrite what's kept.
    const get = vi.spyOn(kv(), 'get').mockRejectedValueOnce(new Error('Upstash timed out')).mockResolvedValueOnce('{not json')
    written('third', 'v3')
    expect((await selfPostBody(KEY, minutes(4))).body).toBe('third')
    expect((await selfPostBody(KEY, minutes(6))).body).toBe('third')
    get.mockRestore()
    const { versions } = await selfPostBody(KEY, minutes(8))
    expect(versions.map((v) => v.body)).toEqual(['first', 'second', 'third'])
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
