import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { toast } from './ui'
import { isWatching, useWatch } from './watch'
import { getJson, remembered } from './remembered'

// Notifications and the icon badge. This device tells the server what it wants to hear about
// (api/push.ts): the daily edition, replies in watched threads, major incidents from chosen status
// pages, and Outage watch spikes. Opening the app resets the badge.

interface PushInfo {
  enabled: boolean
  publicKey?: string
  /** When the server last ran alerts: missing means they haven't run yet. */
  alertsAt?: number
  /** Whether QStash is on the deployment, so alerts can schedule themselves. */
  scheduler?: boolean
}
export const pushInfo = remembered(() => getJson<PushInfo>('/api/push?key'), { enabled: false } as PushInfo)

/** True when this deployment sends notifications and this browser can receive them (iOS: only once installed). */
export const pushAvailable = async () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && (await pushInfo()).enabled

const keyBytes = (base64: string) => {
  const raw = atob(
    base64
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(base64.length / 4) * 4, '='),
  )
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export interface AlertSettings {
  edition: boolean
  replies: boolean
  outages: boolean
  /** Status pages (built-in ids or followed hosts) whose major incidents you want. */
  incidents: string[]
}

interface PushState {
  subscribed: boolean
  alerts: AlertSettings
  setAlerts: (patch: Partial<AlertSettings>) => void
  subscribe: () => Promise<boolean>
  unsubscribe: () => Promise<void>
  sendTest: () => Promise<void>
}

/** Thread keys the server can count replies for (api/_lib/threadCounts.ts). */
const COUNTABLE = /^(hn|lb|dv|bs|lm|md)-/

const subscription = async () => (await navigator.serviceWorker.ready).pushManager?.getSubscription()

/** Sends this device's preferences and watch list to the server. Cheap; called whenever they change. */
async function register() {
  const sub = await subscription()
  if (!sub) return
  const watched = Object.values(useWatch.getState().items)
    .filter((w) => isWatching(w) && COUNTABLE.test(w.story.key))
    .sort((a, b) => b.lookedAt - a.lookedAt)
    .slice(0, 100)
    .map((w) => ({ key: w.story.key, title: w.story.title, lookedAt: w.lookedAt }))
  await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), alerts: { ...usePush.getState().alerts, watched } }) })
}

let timer: ReturnType<typeof setTimeout> | undefined
const registerSoon = () => {
  clearTimeout(timer)
  timer = setTimeout(() => void register().catch(() => {}), 2000)
}

export const usePush = create<PushState>()(
  persist(
    (set, get) => ({
      subscribed: false,
      alerts: { edition: true, replies: true, outages: false, incidents: [] },
      setAlerts: (patch) => {
        set({ alerts: { ...get().alerts, ...patch } })
        registerSoon()
      },
      subscribe: async () => {
        try {
          const { publicKey } = await pushInfo()
          if (!publicKey) throw new Error('not set up')
          if ((await Notification.requestPermission()) !== 'granted') {
            toast('Notifications are blocked for PaperWing in this browser', { tone: 'error' })
            return false
          }
          const reg = await navigator.serviceWorker.ready
          await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
          await register()
          set({ subscribed: true })
          toast('Notifications are on')
          return true
        } catch (err) {
          toast(`Couldn't turn on notifications: ${err instanceof Error ? err.message : 'unknown error'}`, { tone: 'error' })
          return false
        }
      },
      unsubscribe: async () => {
        const sub = await subscription()
        if (sub) {
          await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ remove: sub.endpoint }) }).catch(() => {})
          await sub.unsubscribe()
        }
        set({ subscribed: false })
        void setBadge(0)
        toast('Notifications are off')
      },
      sendTest: async () => {
        try {
          const sub = await subscription()
          if (!sub) throw new Error('this device has no subscription. Turn notifications off and on again')
          const res = await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ test: sub.endpoint }) })
          if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `error ${res.status}`)
          toast('Sent. It should arrive in a few seconds')
        } catch (err) {
          toast(`Couldn't send a test: ${err instanceof Error ? err.message : 'unknown error'}`, { tone: 'error' })
        }
      },
    }),
    // The subscription itself lives in the browser; only the choices are kept here.
    { name: 'readout:alerts', version: 1, partialize: (s) => ({ alerts: s.alerts }) },
  ),
)

type BadgeNavigator = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }

/** The number on the app icon. Installed apps only; elsewhere this does nothing. */
export async function setBadge(n: number) {
  const nav = navigator as BadgeNavigator
  try {
    if (n > 0) await nav.setAppBadge?.(n)
    else await nav.clearAppBadge?.()
  } catch {
    /* not allowed here (no notification permission): no badge */
  }
}

/** New replies across watched threads: what the badge shows while you're in the app. */
const freshReplies = () => Object.values(useWatch.getState().items).reduce((n, w) => n + (isWatching(w) ? (w.fresh ?? 0) : 0), 0)

/** Starts at launch: keeps the badge and the server's copy of your watch list current. */
export function startAlerts() {
  if (!('serviceWorker' in navigator)) return
  void subscription()
    .then((sub) => {
      usePush.setState({ subscribed: !!sub })
      // Subscriptions can rotate; re-registering at launch keeps the server's copy current.
      if (sub) registerSoon()
    })
    .catch(() => {})

  const opened = async () => {
    void setBadge(freshReplies())
    const sub = await subscription().catch(() => undefined)
    if (sub) void fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seen: sub.endpoint }) }).catch(() => {})
  }
  void opened()
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void opened())

  let lastWatch = JSON.stringify(watchSignature())
  useWatch.subscribe(() => {
    void setBadge(freshReplies())
    // Only what the server needs (which threads, when you last looked) triggers a new registration.
    const sig = JSON.stringify(watchSignature())
    if (sig !== lastWatch && usePush.getState().subscribed) registerSoon()
    lastWatch = sig
  })
}

const watchSignature = () =>
  Object.values(useWatch.getState().items)
    .filter(isWatching)
    .map((w) => [w.story.key, w.lookedAt])
