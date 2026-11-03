import type { Page, Request, Route } from '@playwright/test'
import type { SelfPostBody } from '../../src/lib/paperwing'
import type { Article, Story } from '../../src/lib/types'
import type { FoundFeed } from '../../src/lib/publishers'
import { HN_TOP, SEABED, MELTING, WEB_WE_LOST_ARTICLE, WEB_WE_LOST_THREAD, type HnHit, type HnItem, type LemmyPostView } from '../fixtures/upstream'

// Every request the app makes in a journey is answered here, from fixtures, or blocked. The
// preview server only serves the built files: our /api, /rss and /xrpc, and every host the
// browser calls directly (Algolia, HN's Firebase, Bluesky, Lemmy, dev.to, Mastodon), are stubbed.
// Anything else is aborted and recorded, so a journey never reaches the internet.

/** An answer with a status: `fail(500)` for a source that's down. Anything else a stub returns is a 200 with that JSON. */
export class Reply {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {}
}
export const fail = (status = 500, error = `The feed answered ${status}`) => new Reply(status, { error })
const notFound = (what: string) => fail(404, `Not stubbed: ${what}`)

type Answer<T> = T | Reply

/** What the stubbed world holds. A journey overrides any part of it; maps merge key by key. */
export interface Stubs {
  discover: FoundFeed[]
  /** /api/feed?src=<src>, or <src>:<label> for one RSS feed ("rss:Quanta"): stories, as the server sends them. */
  feeds: Record<string, Answer<Story[]>>
  /** Hacker News' top stories, in order: Firebase's id list and Algolia's hits for them. */
  hnTop: Answer<HnHit[]>
  /** What an Algolia keyword search finds: hits whose title contains the query. */
  hnSearch: HnHit[]
  /** Algolia's thread for an HN id. */
  hnItems: Record<string, HnItem>
  /** Lemmy's posts, by community_name (`world@lemmy.world`). */
  lemmy: Record<string, Answer<LemmyPostView[]>>
  /** Bluesky custom feeds and lists through the public AppView, by at:// URI. */
  bluesky: Record<string, unknown[]>
  /** Bluesky threads through the public AppView (getPostThread), by the post's at:// URI. */
  blueskyThreads: Record<string, unknown>
  /** PaperWing self posts' words and versions (/api/thread?src=paperwing), by story key. */
  selfPosts: Record<string, Answer<SelfPostBody>>
  /** The reader view: /api/extract, by article URL. */
  extract: Record<string, Answer<Article>>
  /** A link's card (its own title and description), by URL: what Post a link reads in. */
  cards: Record<string, { title?: string; description?: string }>
  /** Whether this deployment has sync (`/api/sync?status`). */
  sync: boolean
}

const DEFAULTS: Stubs = {
  discover: [],
  feeds: { 'rss:Quanta': [MELTING] },
  hnTop: HN_TOP,
  hnSearch: [],
  hnItems: { [WEB_WE_LOST_THREAD.id]: WEB_WE_LOST_THREAD },
  lemmy: { 'world@lemmy.world': [SEABED] },
  bluesky: {},
  blueskyThreads: {},
  selfPosts: {},
  extract: { [WEB_WE_LOST_ARTICLE.url]: WEB_WE_LOST_ARTICLE },
  cards: {},
  sync: true,
}

const MAPS = ['feeds', 'hnItems', 'lemmy', 'bluesky', 'blueskyThreads', 'selfPosts', 'extract', 'cards'] as const

function mergeStubs(base: Stubs, over: Partial<Stubs>): Stubs {
  const out = { ...base, ...over }
  for (const k of MAPS) Object.assign(out, { [k]: { ...base[k], ...over[k] } })
  return out
}

/** One request the app made to a stubbed address, with what it sent. */
export interface Call {
  method: string
  url: URL
  body: string | null
}

export interface Network {
  /** Requests to hosts nothing here answers: aborted. A journey that leaves this non-empty is missing a stub. */
  blocked: string[]
  /** Requests to our own /api that no stub knows: answered 404. */
  unhandled: string[]
  /** Every stubbed request, in order. */
  calls: Call[]
}

type Handler = (url: URL, req: Request, stubs: Stubs) => unknown | Reply | undefined

const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean)

/** Handlers by host; the preview's own origin is `self`. Undefined means "no stub for this". */
const HOSTS: Record<string, Handler> = {
  self: (url, req, s) => {
    const p = url.pathname
    const q = url.searchParams
    if (p === '/api/feed') {
      const src = q.get('src') ?? ''
      // Site icons are images; without one the app draws a letter.
      if (src === 'icon') return fail(404, 'No icon')
      if (src === 'card') return s.cards[q.get('url') ?? ''] ?? {}
      // A community board answers with itself and its posts (stories under "board:<did>").
      if (src === 'board') {
        const did = q.get('did') ?? ''
        const rkey = q.get('rkey') ?? ''
        return { board: { uri: `at://${did}/io.paperwing.board/${rkey}`, name: 'Board', official: false, moderators: [], moderatorHandles: {} }, stories: s.feeds[`board:${did}`] ?? [] }
      }
      if (src === 'discover') return s.discover
      return s.feeds[`${src}:${q.get('label')}`] ?? s.feeds[src] ?? []
    }
    if (p === '/api/extract') return s.extract[q.get('url') ?? ''] ?? fail(422, 'Could not extract an article')
    if (p === '/api/thread' && q.get('src') === 'paperwing') return s.selfPosts[q.get('id') ?? ''] ?? notFound(`self post ${q.get('id')}`)
    if (p === '/api/thread') return notFound(`thread ${url.search}`)
    if (p === '/api/sync') {
      if (q.has('status')) return { enabled: s.sync }
      if (req.method() === 'POST') return { records: [], cursor: 1, more: false }
    }
    // Bluesky's own feeds need a deployment with a feed generator: this one has none.
    if (p === '/api/atproto') return q.get('route') === 'status' ? { enabled: false } : []
    if (p === '/api/outages') return { checkedAt: Date.now(), scanned: 0, providers: [] }
    if (p === '/api/spice') return {}
    return undefined
  },
  'hacker-news.firebaseio.com': (url, _req, s) => {
    const list = url.pathname.match(/^\/v0\/(\w+)stories\.json$/)
    if (list) return list[1] === 'top' ? (s.hnTop instanceof Reply ? s.hnTop : s.hnTop.map((h) => Number(h.objectID))) : []
    const item = url.pathname.match(/^\/v0\/item\/(\d+)\.json$/)
    if (item) return { kids: (s.hnItems[item[1]]?.children ?? []).map((c) => c.id) }
    return undefined
  },
  'hn.algolia.com': (url, _req, s) => {
    const item = url.pathname.match(/^\/api\/v1\/items\/(\d+)$/)
    if (item) return s.hnItems[item[1]] ?? notFound(`HN item ${item[1]}`)
    if (!/^\/api\/v1\/search(_by_date)?$/.test(url.pathname)) return undefined
    const tags = url.searchParams.get('tags') ?? ''
    // Hydrating a list: tags=(story_1,story_2).
    if (tags.includes('story_')) {
      const ids = new Set(tags.match(/story_(\d+)/g)!.map((t) => t.slice(6)))
      return { hits: (s.hnTop instanceof Reply ? [] : s.hnTop).filter((h) => ids.has(h.objectID)) }
    }
    const query = words(url.searchParams.get('query') ?? '')
    const found = query.length ? s.hnSearch.filter((h) => query.every((w) => h.title.toLowerCase().includes(w))) : s.hnSearch
    return { hits: found }
  },
  'lemmy.world': (url, req, s) => HOSTS['programming.dev'](url, req, s),
  'programming.dev': (url, _req, s) => {
    if (url.pathname === '/api/v3/post/list') {
      const posts = s.lemmy[url.searchParams.get('community_name') ?? ''] ?? []
      return posts instanceof Reply ? posts : { posts }
    }
    if (url.pathname === '/api/v3/search') return { posts: [], comments: [], communities: [], users: [] }
    return undefined
  },
  'public.api.bsky.app': (url, _req, s) => {
    const m = url.pathname.match(/^\/xrpc\/app\.bsky\.feed\.(getFeed|getListFeed)$/)
    if (m) return { feed: s.bluesky[url.searchParams.get(m[1] === 'getFeed' ? 'feed' : 'list') ?? ''] ?? [] }
    if (url.pathname === '/xrpc/app.bsky.feed.getPostThread') return s.blueskyThreads[url.searchParams.get('uri') ?? ''] ?? notFound(`Bluesky thread ${url.searchParams.get('uri')}`)
    return undefined
  },
  'dev.to': (url) => (url.pathname === '/api/articles' ? [] : undefined),
  // Mastodon: trends and hashtags read through Hachyderm unless signed in elsewhere.
  'hachyderm.io': (url) => (/^\/api\/v1\/(trends\/(links|statuses)|timelines\/tag\/)/.test(url.pathname) ? [] : undefined),
  'webmention.io': () => ({ type: 'feed', children: [] }),
}

/**
 * Answers every request the page makes from `stubs` (merged over the defaults), and blocks any
 * other host. Call before the first navigation.
 */
export async function stubNetwork(page: Page, over: Partial<Stubs> = {}): Promise<Network> {
  const stubs = mergeStubs(DEFAULTS, over)
  const net: Network = { blocked: [], unhandled: [], calls: [] }

  await page.context().route('**/*', async (route: Route) => {
    const req = route.request()
    const url = new URL(req.url())
    // The preview server (playwright.config.ts) is the only local origin.
    const self = url.hostname === 'localhost'
    // The built app itself: HTML, scripts, styles, fonts, images.
    if (self && !/^\/(api|rss|xrpc|\.well-known)(\/|$)/.test(url.pathname)) return route.fallback()
    const handler = HOSTS[self ? 'self' : url.hostname]
    const answer = handler?.(url, req, stubs)
    if (answer === undefined) {
      if (!self) {
        net.blocked.push(`${req.method()} ${url.href}`)
        return route.abort('blockedbyclient')
      }
      net.unhandled.push(`${req.method()} ${url.pathname}${url.search}`)
      return route.fulfill({ status: 404, json: { error: `Not stubbed: ${url.pathname}` } })
    }
    net.calls.push({ method: req.method(), url, body: req.postData() })
    const reply = answer instanceof Reply ? answer : new Reply(200, answer)
    // Cross-origin APIs the app calls from the browser are CORS-open; so are their stand-ins.
    return route.fulfill({ status: reply.status, json: reply.body, headers: self ? {} : { 'access-control-allow-origin': '*' } })
  })
  return net
}
