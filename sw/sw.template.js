/* PaperWing service worker. Generated at build time: vite.config.ts fills in VERSION and PRECACHE. */
const VERSION = '__VERSION__'
const PRECACHE = self.__PRECACHE__
const SHELL = `readout-shell-${VERSION}`
const RUNTIME = 'readout-runtime'
// Filled by the app when an article is saved for offline (see src/lib/library.ts).
const IMAGES = 'readout-images'
const NAV_TIMEOUT_MS = 3500

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('readout-shell-') && key !== SHELL) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

// The page asks before we take over, so an update never swaps code under someone mid-read.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

async function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])
}

async function networkFirst(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName)
  try {
    const response = await (timeoutMs ? withTimeout(fetch(request), timeoutMs) : fetch(request))
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (err) {
    const cached = await cache.match(request, MATCH)
    if (cached) return cached
    throw err
  }
}

// ignoreVary: module scripts carry an Origin header the precache request didn't, and servers send Vary: Origin.
const MATCH = { ignoreVary: true }

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, MATCH)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) (await caches.open(cacheName)).put(request, response.clone())
  return response
}

// Notifications from api/push.ts: the daily edition, replies, incidents and outage spikes. They
// come in Declarative Web Push form ({ web_push: 8030, notification: {...} }), which Safari 18.4+
// can show without this worker; everywhere else it's shown here. Older payloads are flat.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    /* not JSON: use the defaults */
  }
  const n = data.web_push === 8030 && data.notification ? data.notification : data
  const url = n.navigate || n.url || '/today'
  const badge = Number(n.app_badge ?? data.app_badge)
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(n.title || 'PaperWing', {
        body: n.body || '',
        icon: '/icon-192.png',
        badge: '/favicon-32.png',
        tag: n.tag || 'readout',
        data: { url },
      }),
      Number.isFinite(badge) && self.navigator.setAppBadge ? self.navigator.setAppBadge(badge).catch(() => {}) : Promise.resolve(),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Notifications only ever open PaperWing itself.
  let url = '/today'
  try {
    const given = new URL((event.notification.data && event.notification.data.url) || '/today', self.location.origin)
    if (given.origin === self.location.origin) url = given.href
  } catch {
    /* keep /today */
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (open) return open.focus().then((w) => w.navigate(url))
      return self.clients.openWindow(url)
    }),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    // Every route is the same SPA shell; fall back to it when the network is slow or gone.
    event.respondWith(
      (async () => {
        try {
          return await withTimeout(fetch(request), NAV_TIMEOUT_MS)
        } catch {
          return (await caches.match('/index.html', MATCH)) || Response.error()
        }
      })(),
    )
    return
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/assets/') || PRECACHE.includes(url.pathname)) {
      event.respondWith(cacheFirst(request, SHELL))
      return
    }
    if (url.pathname.startsWith('/api/')) {
      event.respondWith(networkFirst(request, RUNTIME, 12000))
      return
    }
    return
  }

  if (request.destination === 'image') {
    event.respondWith(
      (async () => {
        const saved = await (await caches.open(IMAGES)).match(request.url, MATCH)
        return saved || fetch(request)
      })(),
    )
  }
})
