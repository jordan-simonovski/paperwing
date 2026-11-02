import type { Plugin } from 'vite'

/**
 * Stories never reach PaperWing's server. Requests for it that a fetch stub can't see (an <img> of
 * a favicon at /api/feed?src=icon) get a 404 here, before Vite would compile api/*.ts as a browser
 * module and drag its server-only libraries into the bundle mid-run.
 */
export const noServer = (): Plugin => ({
  name: 'stories-no-server',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!/^\/(api|rss|xrpc|\.well-known)(\/|\?|$)/.test(req.url ?? '')) return next()
      res.statusCode = 404
      res.end()
    })
  },
})
