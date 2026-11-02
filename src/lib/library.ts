import { createStore, del, entries, get, set, setMany } from 'idb-keyval'
import { create } from 'zustand'
import { fetchArticle, fetchThread, findDiscussions } from './sources'
import { FetchError } from './sources/http'
import type { Article, Comment, SourceKind, Story, Thread } from './types'

export type SavedState = 'queue' | 'archive'

/** One place a saved link is being discussed, and how big that conversation was. */
export interface DiscussionRef {
  key: string
  source: SourceKind
  comments: number
  discussionUrl: string | null
}

export interface SavedItem {
  story: Story
  article?: Article
  thread?: Thread
  savedAt: number
  /** Missing on items saved before the queue existed; those count as queued. */
  state?: SavedState
  archivedAt?: number
  /** Furthest point read in the article, 0..1. */
  progress?: number
  /** Where reading stopped, 0..1, for resuming. */
  position?: number
  minutes?: number
  /** The discussions as they were when you last looked (save time, or your last open). */
  seen?: DiscussionRef[]
  /** The discussions as of the last check. */
  latest?: { discussions: DiscussionRef[]; checkedAt: number }
  /** True while the article and thread still need fetching (imports, synced items). */
  hollow?: boolean
  updatedAt: number
}

/** What travels between devices: everything but the downloaded article, thread and local checks. */
export type SyncedItem = Omit<SavedItem, 'article' | 'thread' | 'hollow' | 'latest'>

export const toSynced = (item: SavedItem): SyncedItem => {
  const { article: _a, thread: _t, hollow: _h, latest: _l, ...rest } = item
  void [_a, _t, _h, _l]
  return rest
}

export type SavedMeta = Omit<SavedItem, 'article' | 'thread'> & { hasArticle: boolean; hasThread: boolean }

const db = createStore('readout-library', 'items')
// Deletions are remembered so sync can tell "removed here" from "never seen here".
const tombstoneDb = createStore('readout-library-tombstones', 'keys')
const IMAGE_CACHE = 'readout-images'
/**
 * Chrome counts each cross-origin (opaque) image as megabytes against the site's quota, and a full
 * quota can evict all of the site's storage, this library included. Oldest images go first.
 * ponytail: a ceiling, not cleanup on unsave; prune per item if offline figures go missing.
 */
const IMAGE_KEEP = 400

/** Deletes all but the `n` most recently written entries (Cache Storage lists them oldest first). */
export async function keepNewest(cache: Pick<Cache, 'keys' | 'delete'>, n: number) {
  const keys = await cache.keys()
  await Promise.all(keys.slice(0, Math.max(0, keys.length - n)).map((k) => cache.delete(k)))
}

/**
 * Puts article images in a Cache the service worker reads from, so saved articles keep their
 * figures offline, along with the story's own thumbnail and post images for its row and reader.
 */
async function cacheImages(html: string, story?: Story) {
  if (!('caches' in window)) return
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const own = story ? [story.thumbnail, ...(story.media ?? []).flatMap((m) => [m.thumb, m.full])] : []
  const srcs = [...own, ...[...doc.querySelectorAll('img[src]')].map((i) => i.getAttribute('src'))].filter((s): s is string => !!s && s.startsWith('http')).slice(0, 48)
  const cache = await caches.open(IMAGE_CACHE)
  await Promise.allSettled(srcs.map(async (src) => cache.put(src, await fetch(src, { mode: 'no-cors', referrerPolicy: 'no-referrer' }))))
  await keepNewest(cache, IMAGE_KEEP)
}

export const readingMinutes = (a?: Article) => (a?.length ? Math.max(1, Math.round(a.length / 5 / 230)) : undefined)
export const totalComments = (d?: DiscussionRef[]) => (d ?? []).reduce((n, x) => n + x.comments, 0)
export const stateOf = (m: Pick<SavedItem, 'state'>): SavedState => m.state ?? 'queue'

const countComments = (cs: Comment[]): number => cs.reduce((n, c) => n + 1 + countComments(c.children) + (c.more ?? 0), 0)
const ref = (s: Story): DiscussionRef => ({ key: s.key, source: s.source, comments: s.comments ?? 0, discussionUrl: s.discussionUrl })

/** Where a story is discussed: itself, if it has a thread, and the other places it was seen. */
function discussionsOf(story: Story & { alsoOn?: Story[]; coverage?: Story[] }): DiscussionRef[] {
  return [story, ...(story.alsoOn ?? []), ...(story.coverage ?? [])].filter((s) => s.hasThread).map(ref)
}

/** Drops the feed's ranking fields (heat, topics, alsoOn) before a story is stored. */
function plainStory(s: Story): Story {
  const copy = { ...s } as Record<string, unknown>
  delete copy.alsoOn
  delete copy.coverage
  delete copy.heat
  delete copy.topics
  return copy as unknown as Story
}

function mergeRefs(a: DiscussionRef[] = [], b: DiscussionRef[] = []): DiscussionRef[] {
  const out = new Map(a.map((d) => [d.key, d]))
  for (const d of b) if (!out.has(d.key) || d.comments > out.get(d.key)!.comments) out.set(d.key, d)
  return [...out.values()]
}

/** A failed download that could work later: no connection, or the server failing rather than the page. */
const worthRetrying = (err: unknown) => !(err instanceof FetchError) || !err.status || err.status >= 500 || err.status === 429

function meta(item: SavedItem): SavedMeta {
  const { article, thread, ...rest } = item
  return { ...rest, hasArticle: !!article, hasThread: !!thread }
}

interface Library {
  items: Record<string, SavedMeta>
  ready: boolean
  pending: Record<string, true>
  load: () => Promise<void>
  save: (story: Story & { alsoOn?: Story[]; coverage?: Story[] }, opts?: { hollow?: boolean; savedAt?: number; state?: SavedState }) => Promise<SavedMeta>
  remove: (key: string) => Promise<void>
  get: (key: string) => Promise<SavedItem | undefined>
  all: () => Promise<SavedItem[]>
  update: (key: string, patch: Partial<SavedItem> | ((item: SavedItem) => Partial<SavedItem>)) => Promise<void>
  archive: (key: string, archived?: boolean) => Promise<void>
  /** Records the discussions you have now seen, so "new since" resets. */
  markSeen: (key: string) => Promise<void>
  /** Re-checks queued items' discussions, oldest check first, and refreshes their offline threads. */
  refresh: (opts?: { limit?: number; maxAgeMs?: number }) => Promise<void>
  /** Fetches articles and threads for hollow items (imports, synced items) a few at a time. */
  hydrate: () => Promise<void>
  /** Writes items arriving from sync or import without fetching anything. */
  putMany: (items: SavedItem[]) => Promise<void>
  /**
   * Applies items and deletions from another device. An item replaces the local copy only when
   * it's newer, and keeps any article and thread already downloaded here.
   */
  applyRemote: (changes: { key: string; updatedAt: number; item?: SyncedItem }[]) => Promise<void>
  tombstones: () => Promise<Record<string, number>>
  clearTombstone: (key: string) => Promise<void>
}

let refreshing = false
let hydrating = false

/**
 * Asks the browser to keep this site's storage through cleanups, so saved articles survive low
 * disk space and Safari's eviction of idle sites. Asked once, at the first save: browsers grant it
 * more readily to sites people use, and installed apps get it outright.
 */
let protecting: Promise<boolean> | undefined
export const protectStorage = () =>
  (protecting ??= (navigator.storage?.persist?.() ?? Promise.resolve(false))
    .catch(() => false)
    // A refusal can change (once installed, say), so only a yes is remembered.
    .then((ok) => {
      if (!ok) protecting = undefined
      return ok
    }))

export const useLibrary = create<Library>()((setState, getState) => {
  const write = async (item: SavedItem) => {
    await set(item.story.key, item, db)
    setState((s) => ({ items: { ...s.items, [item.story.key]: meta(item) } }))
  }

  return {
    items: {},
    ready: false,
    pending: {},
    load: async () => {
      const all = await entries<string, SavedItem>(db)
      setState({ items: Object.fromEntries(all.map(([k, v]) => [k, meta({ ...v, updatedAt: v.updatedAt ?? v.savedAt })])), ready: true })
    },
    save: async (story, opts = {}) => {
      void protectStorage()
      const key = story.key
      const base: SavedItem = {
        story: plainStory(story),
        savedAt: opts.savedAt ?? Date.now(),
        state: opts.state ?? 'queue',
        seen: discussionsOf(story),
        updatedAt: Date.now(),
      }
      if (opts.hollow) {
        const item = { ...base, hollow: true }
        await del(key, tombstoneDb)
        await write(item)
        return meta(item)
      }
      // Marked before the first await, so a second save of the same story (a double tap) is refused.
      setState((s) => ({ pending: { ...s.pending, [key]: true } }))
      try {
        await del(key, tombstoneDb)
        const [article, thread, elsewhere] = await Promise.allSettled([
          story.url ? fetchArticle(story.url) : Promise.reject(),
          story.hasThread ? fetchThread(key) : Promise.reject(),
          story.url ? findDiscussions(story.url) : Promise.reject(),
        ])
        const item: SavedItem = {
          ...base,
          // The baseline for "new since you saved": everywhere it's already being discussed.
          seen: mergeRefs(base.seen, elsewhere.status === 'fulfilled' ? elsewhere.value.map(ref) : []),
          article: article.status === 'fulfilled' ? article.value : undefined,
          thread: thread.status === 'fulfilled' && thread.value ? thread.value : undefined,
        }
        item.minutes = readingMinutes(item.article)
        // Shared links arrive with only a URL; the article knows its own title.
        if (item.story.title === item.story.url && item.article?.title) item.story = { ...item.story, title: item.article.title }
        await write(item)
        void cacheImages(item.article?.html ?? '', item.story)
        return meta(item)
      } finally {
        setState((s) => {
          const pending = { ...s.pending }
          delete pending[key]
          return { pending }
        })
      }
    },
    remove: async (key) => {
      await del(key, db)
      await set(key, Date.now(), tombstoneDb)
      setState((s) => {
        const items = { ...s.items }
        delete items[key]
        return { items }
      })
    },
    get: (key) => (getState().items[key] ? get<SavedItem>(key, db) : Promise.resolve(undefined)),
    all: async () => (await entries<string, SavedItem>(db)).map(([, v]) => v),
    update: async (key, patch) => {
      const item = await get<SavedItem>(key, db)
      if (!item) return
      const next = { ...item, ...(typeof patch === 'function' ? patch(item) : patch), updatedAt: Date.now() }
      await write(next)
    },
    archive: (key, archived = true) => getState().update(key, archived ? { state: 'archive', archivedAt: Date.now() } : { state: 'queue', archivedAt: undefined }),
    markSeen: (key) => getState().update(key, (item) => ({ seen: item.latest?.discussions ?? item.seen })),
    refresh: async ({ limit = 20, maxAgeMs = 15 * 60_000 } = {}) => {
      if (refreshing || !navigator.onLine) return
      refreshing = true
      try {
        const due = Object.values(getState().items)
          .filter((m) => stateOf(m) === 'queue' && !m.hollow && Date.now() - (m.latest?.checkedAt ?? 0) > maxAgeMs)
          .sort((a, b) => (a.latest?.checkedAt ?? 0) - (b.latest?.checkedAt ?? 0))
          .slice(0, limit)
        const check = async (m: SavedMeta) => {
          const item = await get<SavedItem>(m.story.key, db)
          if (!item) return
          const found = new Map<string, DiscussionRef>()
          for (const d of item.latest?.discussions ?? item.seen ?? []) found.set(d.key, d)
          // HN by URL finds new submissions of the same link too.
          if (item.story.url) for (const s of await findDiscussions(item.story.url).catch(() => [])) found.set(s.key, ref(s))
          // The story's own thread, re-fetched so the offline copy stays current.
          let thread: Thread | undefined
          if (item.story.hasThread && item.story.source !== 'hn') {
            const fresh = await fetchThread(item.story.key).catch(() => null)
            if (fresh) {
              thread = fresh
              found.set(item.story.key, { ...ref(item.story), comments: countComments(fresh.comments) })
            }
          }
          // Re-read after the fetches: an archive, a removal or reading done meanwhile must stand.
          const cur = await get<SavedItem>(m.story.key, db)
          if (!cur) return
          await write({ ...cur, thread: thread ?? cur.thread, latest: { discussions: [...found.values()], checkedAt: Date.now() } })
        }
        for (let i = 0; i < due.length; i += 3) await Promise.allSettled(due.slice(i, i + 3).map(check))
      } finally {
        refreshing = false
      }
    },
    hydrate: async () => {
      if (hydrating || !navigator.onLine) return
      hydrating = true
      try {
        // Newest first, and only so many per run: a 2,000-link import shouldn't download all at once.
        const hollow = Object.values(getState().items)
          .filter((m) => m.hollow && stateOf(m) === 'queue')
          .sort((a, b) => b.savedAt - a.savedAt)
          .slice(0, 30)
        const fill = async (m: SavedMeta) => {
          const item = await get<SavedItem>(m.story.key, db)
          if (!item) return
          const [article, thread, elsewhere] = await Promise.allSettled([
            item.story.url ? fetchArticle(item.story.url) : Promise.reject(),
            item.story.hasThread ? fetchThread(item.story.key) : Promise.reject(),
            item.story.url ? findDiscussions(item.story.url) : Promise.reject(),
          ])
          // Re-read after the fetches: an edit or a removal made meanwhile must stand.
          const cur = await get<SavedItem>(m.story.key, db)
          if (!cur) return
          const next: SavedItem = {
            ...cur,
            // Stays hollow when the article could come next time (offline, a server error), so it's tried again.
            hollow: article.status === 'rejected' && cur.story.url && worthRetrying(article.reason) ? true : undefined,
            // You haven't looked at an imported link's discussions yet, so today's are the baseline.
            seen: mergeRefs(cur.seen, elsewhere.status === 'fulfilled' ? elsewhere.value.map(ref) : []),
            article: article.status === 'fulfilled' ? article.value : cur.article,
            thread: thread.status === 'fulfilled' && thread.value ? thread.value : cur.thread,
          }
          next.minutes = readingMinutes(next.article)
          if (next.story.title === next.story.url && next.article?.title) next.story = { ...next.story, title: next.article.title }
          // Hydrating isn't an edit; keep updatedAt so sync doesn't treat it as one.
          await set(next.story.key, next, db)
          setState((s) => ({ items: { ...s.items, [next.story.key]: meta(next) } }))
          void cacheImages(next.article?.html ?? '', next.story)
        }
        for (let i = 0; i < hollow.length; i += 3) await Promise.allSettled(hollow.slice(i, i + 3).map(fill))
      } finally {
        hydrating = false
      }
    },
    putMany: async (items) => {
      await setMany(
        items.map((i) => [i.story.key, i]),
        db,
      )
      await Promise.all(items.map((i) => del(i.story.key, tombstoneDb)))
      setState((s) => ({ items: { ...s.items, ...Object.fromEntries(items.map((i) => [i.story.key, meta(i)])) } }))
    },
    applyRemote: async (changes) => {
      const local = getState().items
      const writes: SavedItem[] = []
      const removals: string[] = []
      for (const c of changes) {
        const mine = local[c.key]
        if (mine && mine.updatedAt >= c.updatedAt) continue
        // Removed here after this change was made, and the removal may not have gone up yet.
        if (!mine && ((await get<number>(c.key, tombstoneDb)) ?? 0) >= c.updatedAt) continue
        if (!c.item) {
          if (mine) removals.push(c.key)
          await set(c.key, c.updatedAt, tombstoneDb)
          continue
        }
        const full = mine ? await get<SavedItem>(c.key, db) : undefined
        writes.push({ ...c.item, article: full?.article, thread: full?.thread, latest: full?.latest, hollow: !full?.article && !full?.thread ? true : undefined })
      }
      if (writes.length) await getState().putMany(writes)
      for (const key of removals) await del(key, db)
      if (removals.length)
        setState((s) => {
          const items = { ...s.items }
          for (const key of removals) delete items[key]
          return { items }
        })
    },
    tombstones: async () => Object.fromEntries(await entries<string, number>(tombstoneDb)),
    clearTombstone: (key) => del(key, tombstoneDb),
  }
})
