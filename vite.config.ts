import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Mirrors Vercel's file-based functions in dev: /api/<name> -> api/<name>.ts exporting GET/POST(request).
function vercelApiDev(): Plugin {
  return {
    name: 'vercel-api-dev',
    configureServer(server: ViteDevServer) {
      // The functions read process.env, as they do on Vercel: fill it from .env files (.env.local
      // and friends) for local development, without overriding anything already set.
      for (const [k, v] of Object.entries(loadEnv(server.config.mode, process.cwd(), ''))) process.env[k] ??= v
      server.middlewares.use(async (req, res, next) => {
        // Same rewrites as vercel.json: the Bluesky feed generator's well-known and xrpc paths.
        if (req.url?.startsWith('/.well-known/did.json')) req.url = '/api/atproto?route=did'
        else if (req.url === '/rss' || req.url?.startsWith('/rss/')) req.url = `/api/rss?path=${encodeURIComponent(req.url.slice(4).replace(/^\//, ''))}`
        else if (req.url?.startsWith('/xrpc/')) {
          const [path, qs = ''] = req.url.slice('/xrpc/'.length).split('?')
          req.url = `/api/atproto?route=${path}${qs ? `&${qs}` : ''}`
        }
        if (!req.url?.startsWith('/api/')) return next()
        const url = new URL(req.url, 'http://localhost')
        const name = url.pathname.slice('/api/'.length).replace(/\/$/, '')
        if (!/^[a-z-]+$/.test(name)) return next()
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`)
          const method = req.method ?? 'GET'
          const handler = mod[method]
          if (typeof handler !== 'function') {
            res.statusCode = 405
            return res.end()
          }
          const chunks: Buffer[] = []
          if (method !== 'GET' && method !== 'HEAD') for await (const chunk of req) chunks.push(chunk as Buffer)
          const response: Response = await handler(new Request(url, { method, headers: req.headers as HeadersInit, body: chunks.length ? Buffer.concat(chunks) : undefined }))
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (err) {
          res.statusCode = 500
          res.end(String(err))
        }
      })
    },
  }
}

// Emits sw.js with the hashed app shell to precache. Fonts are left to runtime caching because
// fontsource ships a file per unicode range and most of them are never requested.
function serviceWorker(): Plugin {
  return {
    name: 'readout-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => /\.(js|css|html)$/.test(f))
      const precache = ['/index.html', ...files.filter((f) => f !== 'index.html').map((f) => `/${f}`), '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/favicon-32.png']
      const version = createHash('sha256').update(files.sort().join('|')).digest('hex').slice(0, 10)
      const source = readFileSync('sw/sw.template.js', 'utf8').replace('__VERSION__', version).replace('self.__PRECACHE__', JSON.stringify(precache))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// Shown in Settings, so you can tell which build an installed app is running.
const commit = (
  process.env.VERCEL_GIT_COMMIT_SHA ||
  (() => {
    try {
      return execSync('git rev-parse HEAD').toString()
    } catch {
      return 'dev'
    }
  })()
).slice(0, 7)

export default defineConfig({
  define: { __BUILD__: JSON.stringify({ commit, at: new Date().toISOString() }) },
  plugins: [react(), tailwindcss(), vercelApiDev(), serviceWorker()],
})
