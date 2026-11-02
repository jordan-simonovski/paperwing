import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => import('../test/memoryIdb'))
vi.mock('./sources', () => ({ fetchArticle: vi.fn(), fetchThread: vi.fn(), findDiscussions: vi.fn() }))
import { clear, createStore } from 'idb-keyval'
import { story } from '../test/fixtures'
import { keepNewest, useLibrary, type SavedItem } from './library'
import { fetchArticle, fetchThread, findDiscussions } from './sources'
import { FetchError } from './sources/http'
import type { Article, Story } from './types'

// The library through its interface: saved stories, the background checks and downloads that run
// while the Saved page is open, and changes arriving from other devices.

const article: Article = { url: 'https://anildash.com/2012/12/13/the_web_we_lost/', title: 'The Web We Lost', html: '<p>Hello</p>', length: 4000 }

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}

const lib = () => useLibrary.getState()
const saved = (s: Story, extra: Partial<SavedItem> = {}): SavedItem => ({ story: s, savedAt: 1, state: 'queue', seen: [], updatedAt: 1, ...extra })

beforeEach(async () => {
  await clear(createStore('readout-library', 'items'))
  await clear(createStore('readout-library-tombstones', 'keys'))
  useLibrary.setState({ items: {}, ready: true, pending: {} })
  vi.mocked(fetchArticle).mockReset().mockResolvedValue(article)
  vi.mocked(fetchThread).mockReset().mockResolvedValue(null)
  vi.mocked(findDiscussions).mockReset().mockResolvedValue([])
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal('window', {})
})
afterEach(() => vi.unstubAllGlobals())

describe('checking saved stories for new discussion', () => {
  it('keeps an archive made while the check was out', async () => {
    const s = story({ hasThread: false })
    await lib().putMany([saved(s)])
    const found = deferred<Story[]>()
    vi.mocked(findDiscussions).mockReturnValue(found.promise)

    const checking = lib().refresh({ maxAgeMs: 0 })
    await vi.waitFor(() => expect(findDiscussions).toHaveBeenCalled())
    await lib().archive(s.key)
    const archivedAt = lib().items[s.key].updatedAt
    found.resolve([story({ key: 'lm-7', source: 'lemmy', comments: 12 })])
    await checking

    const item = await lib().get(s.key)
    expect(item).toMatchObject({ state: 'archive', updatedAt: archivedAt })
    expect(item?.latest?.discussions.map((d) => d.key)).toContain('lm-7')
    expect(lib().items[s.key]).toMatchObject({ state: 'archive', updatedAt: archivedAt })
  })

  it('doesn’t bring back a story removed while the check was out', async () => {
    const s = story({ hasThread: false })
    await lib().putMany([saved(s)])
    const found = deferred<Story[]>()
    vi.mocked(findDiscussions).mockReturnValue(found.promise)

    const checking = lib().refresh({ maxAgeMs: 0 })
    await vi.waitFor(() => expect(findDiscussions).toHaveBeenCalled())
    await lib().remove(s.key)
    found.resolve([])
    await checking

    expect(lib().items[s.key]).toBeUndefined()
    expect(await lib().all()).toEqual([])
  })
})

describe('downloading imported and synced stories', () => {
  it('keeps reading progress made while the download was out', async () => {
    const s = story()
    await lib().putMany([saved(s, { hollow: true })])
    const download = deferred<Article>()
    vi.mocked(fetchArticle).mockReturnValue(download.promise)

    const hydrating = lib().hydrate()
    await vi.waitFor(() => expect(fetchArticle).toHaveBeenCalled())
    await lib().update(s.key, { progress: 0.5 })
    const editedAt = lib().items[s.key].updatedAt
    download.resolve(article)
    await hydrating

    const item = await lib().get(s.key)
    expect(item).toMatchObject({ progress: 0.5, updatedAt: editedAt, article })
    expect(item?.hollow).toBeUndefined()
  })

  it('doesn’t bring back a story removed while the download was out', async () => {
    const s = story()
    await lib().putMany([saved(s, { hollow: true })])
    const download = deferred<Article>()
    vi.mocked(fetchArticle).mockReturnValue(download.promise)

    const hydrating = lib().hydrate()
    await vi.waitFor(() => expect(fetchArticle).toHaveBeenCalled())
    await lib().remove(s.key)
    download.resolve(article)
    await hydrating

    expect(lib().items[s.key]).toBeUndefined()
    expect(await lib().all()).toEqual([])
  })

  it('tries again next time when the article couldn’t be reached', async () => {
    const s = story()
    await lib().putMany([saved(s, { hollow: true })])
    vi.mocked(fetchArticle).mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await lib().hydrate()
    expect(lib().items[s.key]).toMatchObject({ hollow: true, hasArticle: false })

    await lib().hydrate()
    expect(lib().items[s.key]).toMatchObject({ hasArticle: true })
    expect(lib().items[s.key].hollow).toBeUndefined()
  })

  it('tries again next time when the server failed', async () => {
    const s = story()
    await lib().putMany([saved(s, { hollow: true })])
    vi.mocked(fetchArticle).mockRejectedValueOnce(new FetchError('Bad gateway', 502))

    await lib().hydrate()
    expect(lib().items[s.key]).toMatchObject({ hollow: true, hasArticle: false })
  })

  it('stops trying when the page can’t be read at all', async () => {
    const s = story()
    await lib().putMany([saved(s, { hollow: true })])
    vi.mocked(fetchArticle).mockRejectedValueOnce(new FetchError('No article found', 422))

    await lib().hydrate()
    expect(lib().items[s.key]).toMatchObject({ hasArticle: false })
    expect(lib().items[s.key].hollow).toBeUndefined()
  })

  it('stops trying for a story with no link to download', async () => {
    const s = story({ url: undefined })
    await lib().putMany([saved(s, { hollow: true })])

    await lib().hydrate()
    expect(fetchArticle).not.toHaveBeenCalled()
    expect(lib().items[s.key].hollow).toBeUndefined()
  })
})

describe('changes from other devices', () => {
  it('an older copy doesn’t bring back a story removed here', async () => {
    const s = story()
    await lib().putMany([saved(s)])
    await lib().remove(s.key)
    const removedAt = (await lib().tombstones())[s.key]

    await lib().applyRemote([{ key: s.key, updatedAt: removedAt - 1000, item: saved(s, { updatedAt: removedAt - 1000 }) }])

    expect(lib().items[s.key]).toBeUndefined()
    expect((await lib().tombstones())[s.key]).toBe(removedAt)
  })

  it('an older removal doesn’t move this device’s own removal back in time', async () => {
    const s = story()
    await lib().putMany([saved(s)])
    await lib().remove(s.key)
    const removedAt = (await lib().tombstones())[s.key]

    await lib().applyRemote([{ key: s.key, updatedAt: removedAt - 1000 }])

    expect((await lib().tombstones())[s.key]).toBe(removedAt)
  })

  it('a newer copy brings back a story removed here', async () => {
    const s = story()
    await lib().putMany([saved(s)])
    await lib().remove(s.key)
    const removedAt = (await lib().tombstones())[s.key]

    await lib().applyRemote([{ key: s.key, updatedAt: removedAt + 1000, item: saved(s, { updatedAt: removedAt + 1000 }) }])

    expect(lib().items[s.key]).toMatchObject({ updatedAt: removedAt + 1000, hollow: true })
    expect((await lib().tombstones())[s.key]).toBeUndefined()
  })
})

describe('the offline image cache', () => {
  // Chrome counts each cross-origin image as megabytes against the quota; a full quota can evict
  // the whole site's storage, saved library included. So the cache has a ceiling.
  it('keeps only the newest images', async () => {
    const urls = Array.from({ length: 5 }, (_, i) => `https://example.com/${i}.png`)
    const kept = new Set(urls)
    const cache = { keys: async () => [...kept].map((u) => new Request(u)), delete: async (r: Request) => kept.delete(r.url) }
    await keepNewest(cache, 3)
    expect([...kept]).toEqual(urls.slice(2))
    await keepNewest(cache, 10)
    expect(kept.size).toBe(3)
  })
})
