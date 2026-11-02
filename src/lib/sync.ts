import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getJson, remembered } from './remembered'
import { toSynced, useLibrary, type SyncedItem } from './library'
import { SYNCED_PREFS, usePrefs, type SyncedPrefs } from './store'
import { cleanSummary, pruneSummaries, useSummaries, type CachedSummary } from './summaryCache'
import { isSealed, open, seal, type SyncRecord } from './syncCrypto'
import { useWatch, type Watched } from './watch'

// Devices that share a sync code share a library, preferences and discussion summaries. The code is the only secret:
// the server keys storage by its hash, so anyone with the code has access, and nobody without it.
// Records are encrypted with keys from the code before they go up (syncCrypto.ts). The code can
// come from a passkey (passkey.ts), which is how devices pair without typing it.

interface SyncState {
  code?: string
  /** Server position this device has pulled up to. */
  cursor: number
  /** Local time of the last push; local changes after it go up next time. */
  pushedAt: number
  lastSync?: number
  error?: string
  /** Records the server wouldn't store for size: settings ('prefs') or saved items ('s:…'). Kept until one goes up. */
  notSynced?: string[]
  syncing: boolean
  /** The code comes from a passkey, so other devices join by using it. */
  passkey?: boolean
  setCode: (code?: string, opts?: { passkey?: boolean }) => void
}

export const useSync = create<SyncState>()(
  persist(
    (set) => ({
      cursor: 0,
      pushedAt: 0,
      syncing: false,
      setCode: (code, opts) => {
        // What came from the old code's server is this device's to give the new one: forget the echoes.
        applied.clear()
        set({ code, passkey: !!code && !!opts?.passkey, cursor: 0, pushedAt: 0, lastSync: undefined, error: undefined })
      },
    }),
    { name: 'readout:sync', version: 1, partialize: ({ code, cursor, pushedAt, lastSync, passkey, notSynced }) => ({ code, cursor, pushedAt, lastSync, passkey, notSynced }) },
  ),
)

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

/** 26 base32 characters from 26 bytes: 130 bits, too many to guess. */
export const codeFromBytes = (bytes: Uint8Array) => [...bytes.subarray(0, 26)].map((b) => ALPHABET[b & 31]).join('')

export const newSyncCode = (): string => codeFromBytes(crypto.getRandomValues(new Uint8Array(26)))

export const normalizeCode = (raw: string) => raw.toLowerCase().replace(/[^a-z2-7]/g, '')
export const formatCode = (code: string) => code.match(/.{1,5}/g)?.join('-') ?? code
export const isCode = (code: string) => /^[a-z2-7]{26}$/.test(code)

export const syncAvailable = remembered(() => getJson<{ enabled: boolean }>('/api/sync?status').then((r) => r.enabled), false)

// Records just applied from the server, so pulling them doesn't count as a local edit to push back.
const applied = new Map<string, number>()

async function localChanges(since: number): Promise<SyncRecord[]> {
  const lib = useLibrary.getState()
  const out: SyncRecord[] = []
  for (const item of await lib.all()) {
    const key = `s:${item.story.key}`
    if (item.updatedAt > since && applied.get(key) !== item.updatedAt) out.push({ key, updatedAt: item.updatedAt, data: toSynced(item) })
  }
  for (const [k, ts] of Object.entries(await lib.tombstones())) {
    const key = `s:${k}`
    if (ts > since && applied.get(key) !== ts) out.push({ key, updatedAt: ts, deleted: true })
  }
  for (const w of Object.values(useWatch.getState().items)) {
    const key = `w:${w.story.key}`
    if (w.updatedAt > since && applied.get(key) !== w.updatedAt) out.push({ key, updatedAt: w.updatedAt, data: { ...w, fresh: undefined, total: undefined, checkedAt: undefined } })
  }
  for (const s of await useSummaries.getState().changedSince(since)) {
    const key = `m:${s.key}`
    if (applied.get(key) !== s.updatedAt) out.push({ key, updatedAt: s.updatedAt, data: s })
  }
  const prefs = usePrefs.getState()
  if (prefs.syncedPrefsAt > since && applied.get('prefs') !== prefs.syncedPrefsAt) {
    out.push({ key: 'prefs', updatedAt: prefs.syncedPrefsAt, data: Object.fromEntries(SYNCED_PREFS.map((k) => [k, prefs[k]])) })
  }
  return out
}

/**
 * When records started being sealed. A plain record written after that didn't come from PaperWing
 * (only from someone writing to the database directly), so it's ignored; older ones still count.
 */
const SEALED_SINCE = Date.UTC(2026, 9, 29, 9)

/**
 * A plain record with the time inside it held to the record's own date. Anyone can write one and
 * date it before sealing began; without this, a later time inside would outrank newer edits here.
 */
function asOfItsDate(r: SyncRecord): SyncRecord {
  const inner = (r.data as { updatedAt?: unknown } | undefined)?.updatedAt
  return typeof inner === 'number' && inner > r.updatedAt ? { ...r, data: { ...(r.data as object), updatedAt: r.updatedAt } } : r
}

/** What a preference is: the shape it has when the app starts. A synced value has to match it. */
const shapeOf = (v: unknown) => (Array.isArray(v) ? 'list' : v === null ? 'null' : typeof v)

/** Only the synced preferences, each the right shape: a record can't overwrite anything else in the store. */
function cleanPrefs(data: unknown): Partial<SyncedPrefs> | undefined {
  if (!data || typeof data !== 'object') return undefined
  const d = data as Record<string, unknown>
  const defaults = usePrefs.getInitialState() as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of SYNCED_PREFS) if (k in d && shapeOf(d[k]) === shapeOf(defaults[k])) out[k] = d[k]
  return out as Partial<SyncedPrefs>
}

const storyKeyOf = (data: unknown) => (data as { story?: { key?: unknown } } | undefined)?.story?.key

async function applyRecords(code: string, wire: SyncRecord[]) {
  const items: { key: string; updatedAt: number; item?: SyncedItem }[] = []
  const watched: Watched[] = []
  const summaries: CachedSummary[] = []
  // Plain records still arrive from before encryption; a sealed one this code can't open is skipped.
  const opened = await Promise.all(wire.map((r) => (isSealed(r) ? open(code, r) : r.updatedAt < SEALED_SINCE ? asOfItsDate(r) : undefined)))
  const records = opened.filter((r): r is SyncRecord => !!r)
  for (const r of records) {
    applied.set(r.key, r.updatedAt)
    // A record only ever speaks for the item it's filed under.
    if (r.key.startsWith('w:')) {
      if (r.data && storyKeyOf(r.data) === r.key.slice(2)) watched.push(r.data as Watched)
    } else if (r.key.startsWith('s:')) {
      if (r.deleted) items.push({ key: r.key.slice(2), updatedAt: r.updatedAt })
      else if (storyKeyOf(r.data) === r.key.slice(2)) items.push({ key: r.key.slice(2), updatedAt: r.updatedAt, item: r.data as SyncedItem })
    } else if (r.key.startsWith('m:')) {
      const s = r.deleted ? undefined : cleanSummary(r.key.slice(2), r.data)
      if (s) summaries.push(s)
    } else if (r.key === 'prefs' && !r.deleted && r.updatedAt > usePrefs.getState().syncedPrefsAt) {
      const prefs = cleanPrefs(r.data)
      if (prefs) usePrefs.setState({ ...prefs, syncedPrefsAt: r.updatedAt })
    }
  }
  if (items.length) await useLibrary.getState().applyRemote(items)
  if (watched.length) useWatch.getState().apply(watched)
  if (summaries.length) await useSummaries.getState().applyRemote(summaries)
}

async function post(code: string, body: object) {
  const res = await fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json', 'x-sync-code': code }, body: JSON.stringify(body) })
  const data = (await res.json()) as { records: SyncRecord[]; cursor: number; more: boolean; tooLarge?: string[]; error?: string }
  if (!res.ok) throw new Error(data.error ?? `Sync failed (${res.status})`)
  return data
}

/** What didn't sync, for people: "your settings" and/or "2 saved items", or undefined when everything did. */
export function notSyncedText(keys: string[] | undefined): string | undefined {
  if (!keys?.length) return undefined
  const items = keys.filter((k) => k.startsWith('s:')).length
  const parts = [keys.includes('prefs') && 'your settings', items && (items === 1 ? 'one saved item' : `${items} saved items`)].filter(Boolean)
  return parts.length ? parts.join(' and ') : 'a few things'
}

let running: Promise<void> | undefined
/** The code the running sync is for. */
let runningFor: string | undefined

/** Pushes local changes, then pulls everyone else's. Safe to call often; overlapping calls share one run. */
export function syncNow(): Promise<void> {
  const { code } = useSync.getState()
  if (!code || !navigator.onLine) return Promise.resolve()
  // A run for a code this device has since left finishes on its own; then the new code gets its own.
  if (running && runningFor !== code) return running.then(() => syncNow())
  runningFor = code
  running ??= (async () => {
    useSync.setState({ syncing: true })
    try {
      if (!useLibrary.getState().ready) await useLibrary.getState().load()
      const startedAt = Date.now()
      const changes = await localChanges(useSync.getState().pushedAt)
      let cursor = useSync.getState().cursor
      let first = true
      const tooLarge: string[] = []
      // Pushes in batches; every response also carries a page of other devices' changes.
      for (let i = 0; i === 0 || i < changes.length; i += 400) {
        const sealed = await Promise.all(changes.slice(i, i + 400).map((r) => seal(code, r)))
        const page = await post(code, { since: cursor, exact: !first, changes: sealed })
        tooLarge.push(...(page.tooLarge ?? []))
        first = false
        await applyRecords(code, page.records)
        cursor = page.cursor
        let more = page.more
        while (more) {
          const next = await post(code, { since: cursor, exact: true, changes: [] })
          await applyRecords(code, next.records)
          cursor = next.cursor
          more = next.more
        }
      }
      // Progress and errors belong to the code they were for, never to one joined since.
      if (useSync.getState().code !== code) return
      // What the server wouldn't store isn't resent until it changes (it would only be refused again),
      // but it's remembered and shown, rather than a sync that looks complete. Anything that went up since is off the list.
      const sent = new Set(changes.map((c) => c.key))
      const notSynced = [...new Set([...(useSync.getState().notSynced ?? []).filter((k) => !sent.has(k)), ...tooLarge])]
      useSync.setState({ cursor, pushedAt: startedAt, lastSync: Date.now(), error: undefined, notSynced })
      void useLibrary.getState().hydrate()
    } catch (err) {
      if (useSync.getState().code !== code) return
      useSync.setState({ error: err instanceof Error ? err.message : 'Sync failed' })
    } finally {
      useSync.setState({ syncing: false })
      running = undefined
    }
  })()
  return running
}

/**
 * Joins this device to a sync code (typed, pasted, from a pairing link or a passkey) and runs the
 * first sync. Rejects, with a message for people, when the code isn't one or the first sync fails.
 * The code stays set after a failed sync: the failure is nearly always the network, and the next
 * sync (on the next edit, on return to the app) picks up where this one stopped. Offline, it
 * resolves with the code set, and the first sync runs when the connection is back.
 */
export async function joinSync(raw: string, opts: { passkey?: boolean } = {}): Promise<void> {
  const code = normalizeCode(raw)
  if (!isCode(code)) throw new Error('A sync code is 26 letters and digits')
  const { code: current, setCode } = useSync.getState()
  if (code !== current) setCode(code, opts)
  else if (opts.passkey) useSync.setState({ passkey: true })
  await syncNow()
  const failed = useSync.getState().error
  if (failed) throw new Error(`Couldn’t sync: ${failed}`)
}

/** Turns sync on with a new code: this device's library goes up, ready for others to join. */
export const startSyncWithNewCode = () => joinSync(newSyncCode())

/** Syncs on start, a few seconds after any edit, on return to the app, and every five minutes. */
export function startSync() {
  void pruneSummaries()
  let timer = 0
  const soon = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => void syncNow(), 3000)
  }
  void syncAvailable().then((ok) => ok && useSync.getState().code && void syncNow())
  useLibrary.subscribe((s, prev) => s.items !== prev.items && useSync.getState().code && soon())
  usePrefs.subscribe((s, prev) => s.syncedPrefsAt !== prev.syncedPrefsAt && useSync.getState().code && soon())
  useWatch.subscribe((s, prev) => s.items !== prev.items && useSync.getState().code && soon())
  useSummaries.subscribe((s, prev) => s.rev !== prev.rev && useSync.getState().code && soon())
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void syncNow())
  window.addEventListener('online', () => void syncNow())
  window.setInterval(() => document.visibilityState === 'visible' && void syncNow(), 5 * 60_000)
}
