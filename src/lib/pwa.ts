import { create } from 'zustand'
import { toast } from './ui'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PWA {
  installEvent?: BeforeInstallPromptEvent
  standalone: boolean
  install: () => Promise<void>
}

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export const usePWA = create<PWA>()((set, get) => ({
  installEvent: undefined,
  standalone: standalone(),
  install: async () => {
    const e = get().installEvent
    if (!e) return
    await e.prompt()
    const { outcome } = await e.userChoice
    if (outcome === 'accepted') set({ installEvent: undefined })
  },
}))

/** iOS never fires beforeinstallprompt; it needs Share › Add to Home Screen. */
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function setupPWA() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    usePWA.setState({ installEvent: e as BeforeInstallPromptEvent })
  })
  window.addEventListener('appinstalled', () => usePWA.setState({ installEvent: undefined, standalone: true }))

  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  window.addEventListener('load', async () => {
    // A browser that refuses (private mode, blocked, an unsupported context) just runs without it.
    const reg = await navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    if (!reg) return
    // The first install also fires controllerchange (via clients.claim); only reload when we asked for it.
    let reloadRequested = false
    const apply = (worker: ServiceWorker) => {
      reloadRequested = true
      worker.postMessage('skip-waiting')
    }
    // An installed app is resumed from memory rather than reloaded, so an update that waits for
    // the next launch can wait for days. Apply it at moments nobody is mid-read instead: right at
    // launch, or as the app goes into the background. The route and caches survive the reload.
    // While the app is in front, offer it.
    const offerUpdate = (worker: ServiceWorker) => {
      if (document.visibilityState === 'hidden') return apply(worker)
      toast('A new version of PaperWing is ready', { action: { label: 'Reload', run: () => apply(worker) } })
    }
    if (reg.waiting && navigator.serviceWorker.controller) apply(reg.waiting)
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing
      worker?.addEventListener('statechange', () => {
        // Only an update if a previous worker controls the page; the first install needs no reload.
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker)
      })
    })
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloadRequested) return
      reloadRequested = false
      location.reload()
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && reg.waiting && navigator.serviceWorker.controller) apply(reg.waiting)
    })
    // Installed apps can stay open for days; check for a new build every hour and on refocus.
    setInterval(() => void reg.update(), 60 * 60_000)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void reg.update())
  })
}
