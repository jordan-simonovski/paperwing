import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { defaultShouldDehydrateQuery, QueryClient, type Query } from '@tanstack/react-query'
import { createStore, del, get, set } from 'idb-keyval'
import { timedStorage } from './diag'

const DAY = 86_400_000

export const queryClient = new QueryClient({
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
