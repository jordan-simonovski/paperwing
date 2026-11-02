import { useSyncExternalStore } from 'react'

// Whether there's a release you haven't read about yet: the version you last opened "What's new" at,
// on this device. A plain value in storage, not a synced preference: each device has its own app.

const KEY = 'readout:seen-version'
const listeners = new Set<() => void>()

function read(): string | undefined {
  try {
    return localStorage.getItem(KEY) ?? undefined
  } catch {
    return undefined
  }
}

/** Numerically newer: 0.10.0 is after 0.9.0. */
export function isNewer(a: string, b: string | undefined): boolean {
  if (!b) return true
  const [x, y] = [a, b].map((v) => v.split('.').map(Number))
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

/** True when this version has a "What's new" you haven't opened. */
export function useUnreadRelease(version = __BUILD__.version): boolean {
  const seen = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => void listeners.delete(cb)),
    read,
    () => undefined,
  )
  return isNewer(version, seen)
}

export function markReleaseRead(version = __BUILD__.version) {
  try {
    localStorage.setItem(KEY, version)
  } catch {
    /* private mode: it shows as new again next time */
  }
  for (const l of listeners) l()
}
