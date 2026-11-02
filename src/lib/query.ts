import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { defaultShouldDehydrateQuery, QueryClient, type Query } from '@tanstack/react-query'
import { createStore, del, get, set } from 'idb-keyval'
import { timedStorage } from './diag'

const DAY = 86_400_000

/**
 * The app's query cache. main.tsx makes the one the app uses and provides it; everything else
 * reaches it through React (useQueryClient) or is handed it, never by importing it, so a test or a
 * story can give each render its own.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 3 * DAY,
        // Serve what we have when offline instead of pausing forever.
        networkMode: 'offlineFirst',
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  })
}

/**
 * Every query key, so whoever writes an entry and whoever reads it agree on its shape. A prefix
 * (`keys.feeds`, `keys.people`) matches all the entries under it, for invalidating.
 */
export const keys = {
  feeds: ['feed'] as const,
  feed: (id: string) => ['feed', id] as const,
  thread: (key: string) => ['thread', key] as const,
  article: (url: string | null | undefined) => ['article', url] as const,
  discussions: (url: string | null | undefined) => ['discussions', url] as const,
  coverage: (key: string | undefined) => ['coverage', key] as const,
  notes: (url: string) => ['notes', url] as const,
  people: ['person'] as const,
  person: (actor: string) => ['person', actor] as const,
  boards: ['boards'] as const,
  board: (did: string | undefined, rkey: string | undefined) => ['board', did, rkey] as const,
  anyBoard: ['board'] as const,
  friends: (did: string | undefined) => ['friends', did] as const,
  me: (did: string | undefined) => ['me', did] as const,
  search: (source: string, q: string, range: string, sort: string) => ['search', source, q, range, sort] as const,
  blueskyStatus: ['bluesky-status'] as const,
  outages: ['outages'] as const,
  webmentions: (url: string | null | undefined) => ['webmentions', url] as const,
  mix: (uri: string) => ['mix', uri] as const,
  explore: (what: string, q: string) => ['explore', what, q] as const,
  discover: (what: string) => ['discover', what] as const,
}

const cache = createStore('readout-cache', 'queries')

export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (k) => get<string>(k, cache).then((v) => v ?? null),
    setItem: (k, v) => set(k, v, cache),
    removeItem: (k) => del(k, cache),
  },
  throttleTime: 2000,
  serialize: (client) => timedStorage(() => JSON.stringify(client)),
})

export const PERSIST_MAX_AGE = 3 * DAY

// The persister re-serializes the whole cache on the main thread every time a query changes.
// Articles and threads are by far the biggest entries (tens of MB after a few days' reading), and
// saved stories already keep their own offline copies in the library, so only feeds and small
// lookups are persisted. Bump the buster whenever this changes, so an old oversized copy is
// dropped rather than parsed at startup.
const HEAVY = new Set(['article', 'thread'])
export const PERSIST_BUSTER = 'v2'
export const dehydrateOptions = {
  shouldDehydrateQuery: (q: Query) => defaultShouldDehydrateQuery(q) && !HEAVY.has(String(q.queryKey[0])),
}
