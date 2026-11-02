import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

// The service worker as the browser runs it: the template filled in the way vite.config.ts does,
// evaluated with a stand-in for Cache Storage, and sent fetch events.

const keyOf = (r: Request | string) => (typeof r === 'string' ? r : r.url)

/** Cache Storage's behaviour that matters here: entries kept in the order they were (re)written. */
class FakeCache {
  entries = new Map<string, Response>()
  async put(request: Request | string, response: Response) {
    this.entries.delete(keyOf(request))
    this.entries.set(keyOf(request), response)
  }
  async match(request: Request | string) {
    return this.entries.get(keyOf(request))?.clone()
  }
  async keys() {
    return [...this.entries.keys()].map((u) => new Request(u))
  }
  async delete(request: Request | string) {
    return this.entries.delete(keyOf(request))
  }
}

function startWorker() {
  const handlers: Record<string, (event: unknown) => void> = {}
  const stores = new Map<string, FakeCache>()
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new FakeCache())
      return stores.get(name)!
    },
    async keys() {
      return [...stores.keys()]
    },
    async delete(name: string) {
      return stores.delete(name)
    },
    async match(request: Request | string) {
      for (const c of stores.values()) if (c.entries.has(keyOf(request))) return c.match(request)
    },
  }
  const network = { online: true }
  const fetch = async () => (network.online ? Response.json({ ok: true }) : Promise.reject(new TypeError('Failed to fetch')))
  const self = { addEventListener: (type: string, fn: (event: unknown) => void) => (handlers[type] = fn), location: { origin: 'https://paperwing.test' } }
  const source = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8')
    .replace('__VERSION__', 'test')
    .replace('self.__PRECACHE__', JSON.stringify(['/index.html']))
  runInNewContext(source, { self, caches, fetch, setTimeout, URL, Request, Response })

  return {
    network,
    stores,
    async get(path: string) {
      let answer: Promise<Response> | undefined
      handlers.fetch({ request: new Request(`https://paperwing.test${path}`), respondWith: (p: Promise<Response>) => (answer = p) })
      const res = await answer!
      // Writing to the cache happens after the answer; let it finish.
      await new Promise((r) => setTimeout(r, 0))
      return res
    },
  }
}

describe('the service worker', () => {
  // Every article, feed and grade is its own address: kept forever, they'd fill the device and
  // crowd out the saved library.
  it('keeps only the most recent API answers for offline use', async () => {
    const worker = startWorker()
    for (let i = 0; i < 260; i++) await worker.get(`/api/extract?url=https://example.com/${i}`)
    const runtime = [...worker.stores.get('readout-runtime')!.entries.keys()]
    expect(runtime.length).toBeLessThanOrEqual(200)
    expect(runtime).toContain('https://paperwing.test/api/extract?url=https://example.com/259')
    expect(runtime).not.toContain('https://paperwing.test/api/extract?url=https://example.com/0')
  })

  it('answers from what it kept when the device is offline', async () => {
    const worker = startWorker()
    await worker.get('/api/feed?src=lobsters')
    worker.network.online = false
    const res = await worker.get('/api/feed?src=lobsters')
    expect(await res.json()).toEqual({ ok: true })
  })
})
