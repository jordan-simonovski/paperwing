import { create } from 'zustand'
import { toast } from './ui'

// Opt-in timing for slow navigation on phones, where there's no profiler at hand. Turned on in
// Settings, Diagnostics. Each Back reports where the time went: before our code ran (the tap
// itself), React rendering the list again, the browser getting the first frame on screen, and any
// stalls in the three seconds after, plus time spent writing to storage meanwhile.

const KEY = 'readout:diag'
const WATCH_MS = 3000
const STALL_MS = 50

export interface NavTiming {
  label: string
  at: number
  /** From the tap to our handler starting. */
  input?: number
  /** From our handler to React finishing the list. */
  react?: number
  /** From our handler to the first frame after that. */
  frame?: number
  /** Gaps between frames over STALL_MS in the WATCH_MS after the first frame. */
  stalls: number[]
  /** Synchronous storage writes in the same window. */
  storage: number
}

export const useDiag = create<{ on: boolean; runs: NavTiming[] }>(() => ({ on: readOn(), runs: [] }))

function readOn() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setDiag(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode: on for this session only */
  }
  useDiag.setState({ on })
  if (on) instrumentStorage()
}

let run: (NavTiming & { start: number; committed?: number }) | undefined
let storageMs = 0

/** Wraps localStorage writes so a run can say how long they blocked. Only once diagnostics are on. */
let instrumented = false
function instrumentStorage() {
  if (instrumented || typeof Storage === 'undefined') return
  instrumented = true
  const original = Storage.prototype.setItem
  Storage.prototype.setItem = function (k: string, v: string) {
    const t = performance.now()
    try {
      return original.call(this, k, v)
    } finally {
      storageMs += performance.now() - t
    }
  }
}
if (useDiag.getState().on) instrumentStorage()

/** Times a synchronous step that should count as storage (the feed cache's serialization). */
export function timedStorage<T>(fn: () => T): T {
  if (!useDiag.getState().on) return fn()
  const t = performance.now()
  try {
    return fn()
  } finally {
    storageMs += performance.now() - t
  }
}

export function navStart(label: string) {
  if (!useDiag.getState().on) return
  const start = performance.now()
  const ev = window.event as Event | undefined
  storageMs = 0
  run = { label, at: Date.now(), start, input: ev && ev.timeStamp > 0 && ev.timeStamp <= start ? Math.round(start - ev.timeStamp) : undefined, stalls: [], storage: 0 }
  const current = run
  let last = 0
  let framesSinceCommit = 0
  const tick = () => {
    if (run !== current) return
    const now = performance.now()
    // The first callback after the commit runs before that frame paints; the next one means it did.
    if (current.committed !== undefined && current.frame === undefined) {
      if (++framesSinceCommit === 2) {
        current.frame = Math.round(now - current.start)
        last = now
      }
    } else if (current.frame !== undefined) {
      if (now - last > STALL_MS) current.stalls.push(Math.round(now - last))
      last = now
    }
    if (current.frame !== undefined && now - current.start > current.frame + WATCH_MS) return finish(current)
    if (now - current.start > 15_000) return finish(current)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

export function navCommitted() {
  if (run && run.committed === undefined) {
    run.committed = performance.now()
    run.react = Math.round(run.committed - run.start)
  }
}

function finish(r: NonNullable<typeof run>) {
  run = undefined
  const timing: NavTiming = { label: r.label, at: r.at, input: r.input, react: r.react, frame: r.frame, stalls: r.stalls, storage: Math.round(storageMs) }
  useDiag.setState((s) => ({ runs: [timing, ...s.runs].slice(0, 20) }))
  toast(describe(timing))
}

export function describe(t: NavTiming): string {
  const parts = [
    t.input !== undefined ? `tap ${t.input}ms` : undefined,
    t.react !== undefined ? `React ${t.react}ms` : 'React never finished',
    t.frame !== undefined ? `first frame ${t.frame}ms` : undefined,
    t.stalls.length ? `${t.stalls.length} stall${t.stalls.length === 1 ? '' : 's'} after (longest ${Math.max(...t.stalls)}ms, ${t.stalls.reduce((a, b) => a + b, 0)}ms in all)` : 'no stalls after',
    `storage ${t.storage}ms`,
  ]
  return `${t.label}: ${parts.filter(Boolean).join(' · ')}`
}
