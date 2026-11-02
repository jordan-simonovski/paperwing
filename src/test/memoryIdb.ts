// idb-keyval in memory, for unit tests in Node (which has no IndexedDB):
//   vi.mock('idb-keyval', () => import('../test/memoryIdb'))
// Each store is a Map; every test file gets its own module, so nothing leaks between files.

type Store = Map<IDBValidKey, unknown>
const stores = new Map<string, Store>()
const fallback: Store = new Map()

export const createStore = (db: string, name: string): Store => {
  const key = `${db}/${name}`
  if (!stores.has(key)) stores.set(key, new Map())
  return stores.get(key)!
}
export const get = async (key: IDBValidKey, store: Store = fallback) => store.get(key)
export const set = async (key: IDBValidKey, value: unknown, store: Store = fallback) => void store.set(key, value)
export const setMany = async (pairs: [IDBValidKey, unknown][], store: Store = fallback) => pairs.forEach(([k, v]) => store.set(k, v))
export const del = async (key: IDBValidKey, store: Store = fallback) => void store.delete(key)
export const entries = async (store: Store = fallback) => [...store.entries()]
export const keys = async (store: Store = fallback) => [...store.keys()]
export const clear = async (store: Store = fallback) => store.clear()
