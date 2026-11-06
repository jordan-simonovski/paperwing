import { fail, json } from './_lib/http.js'
import { fanOutLimited } from './_lib/kv.js'
import type { FeedSource } from '../src/lib/sources/http.js'
import { discoverFeeds } from './_lib/discover.js'
import { directory } from './_lib/directory.js'
import { favicon } from './_lib/icon.js'
import { frontpageActivity, frontpageFeed } from './_lib/frontpage.js'
import { openNetworkDiscussions } from './_lib/atlinks.js'
import { cardImage, ogImage, pageCard } from './_lib/og.js'
import { readMix } from './_lib/mixfeed.js'
import { paperwingFront } from './_lib/paperwing.js'
import { actorOf, person } from './_lib/people.js'
import { marginNotes } from './_lib/notes.js'
import { allBoards, boardFront, readBoard } from './_lib/boards.js'
import { boardPicks } from './_lib/boardPicks.js'
import { arxiv, github, hfPapers, lobsters, newsSearch, releases, rss } from './_lib/sources.js'
import { checkStatusPage, statusIncidents } from './_lib/statuspages.js'
import { standardFeed, StandardRateLimit } from './_lib/standard.js'
import { hiring } from './_lib/hiring.js'
import { isState, WARN_COST, warnStories } from './_lib/warn.js'

// One function for every server-fetched source keeps us well under Vercel Hobby's function limit.
// Each source is one entry in SOURCES: what it needs from the query string, and how long its answer
// may be cached at the edge. GET finds the entry, runs it and answers.

/** The caller asked wrongly (a missing parameter): a 400 with this message, not an upstream failure. */
class BadRequest extends Error {}

/** A query parameter the source can't do without. */
function need(p: URLSearchParams, name: string, what = `${name} required`): string {
  const value = p.get(name)
  if (!value) throw new BadRequest(what)
  return value
}
const sortOf = (v: string | null) => (v === 'new' || v === 'top' ? v : 'hot')
const list = (v: string | null) => (v ?? '').split(',').filter(Boolean)

const LONG_CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000'
/**
 * Bytes from elsewhere served from our own origin (an icon, a card picture): never runnable as a
 * page, since someone could put a script in an SVG and link people straight to it.
 */
const inert = (body: BodyInit, type: string, cache: string, csp = "default-src 'none'; sandbox") =>
  new Response(body, { headers: { 'content-type': type, 'cache-control': cache, 'x-content-type-options': 'nosniff', 'content-security-policy': csp } })
/** No answer is an answer, not an error: 204 keeps misses out of the error rate. */
const nothing = (cache: string, headers: Record<string, string> = {}) => new Response(null, { status: 204, headers: { 'cache-control': cache, ...headers } })

interface Source {
  /** Seconds a JSON answer may be cached at the edge. Sources that build their own Response set their own. */
  ttl: number
  /** Seconds a stale answer may still be served while it refreshes (four times ttl unless said). */
  stale?: number
  /** For a source that fans out to other servers: what one call costs against the caller's allowance (FAN_OUT_PER_MINUTE). */
  cost?: number | ((p: URLSearchParams) => number)
  run(p: URLSearchParams, request: Request): Promise<unknown>
}

export const SOURCES: Record<FeedSource, Source> = {
  lobsters: { ttl: 300, run: (p) => lobsters(p.get('path') ?? 'hottest') },
  rss: { ttl: 900, run: (p) => rss(need(p, 'url'), p.get('label') ?? undefined) },
  standard: { ttl: 900, run: (p, request) => standardFeed(need(p, 'url'), p.get('label') ?? undefined, request) },
  // A link card's words, for sharing a story to Bluesky: a day at the edge.
  card: { ttl: 86_400, run: (p) => pageCard(need(p, 'url')).catch(() => ({})) },
  // The card's picture as bytes, so the app can upload it to the reader's own repo. Only small pictures.
  cardimage: {
    ttl: 0,
    run: (p) =>
      cardImage(p.get('url') ?? '').then(
        ({ body, type }) => inert(body, type, 'public, max-age=86400'),
        () => nothing('public, max-age=3600'),
      ),
  },
  // PaperWing's front page or one board: a minute at the edge (and in KV).
  paperwing: {
    ttl: 60,
    run: (p) => {
      const board = p.get('board') ?? undefined
      return paperwingFront(sortOf(p.get('sort')), board && /^[a-z0-9-]{1,40}$/.test(board) ? board : undefined)
    },
  },
  // A member's Frontpage posts, comments and the replies to them.
  fpactivity: { ttl: 60, cost: 3, run: (p) => frontpageActivity(need(p, 'did')) },
  // A community board and its listings (also cached in KV).
  board: { ttl: 60, cost: 3, run: (p) => boardFront(p.get('did') ?? '', p.get('rkey') ?? '', sortOf(p.get('sort'))) },
  // A board's own record (name, moderators, rules), without its listings or moderation: what its
  // editor and header need, and still there when the board's moderation can't be read.
  // Its owner checks their changes (a new moderator, new rules): a minute or two, not five.
  boardinfo: { ttl: 60, stale: 60, run: (p) => readBoard(need(p, 'did'), need(p, 'rkey')) },
  // Every community board, for Explore.
  // Someone who just made a board goes looking for it: a minute or two at most, not the usual twenty.
  boards: { ttl: 60, stale: 60, run: () => allBoards() },
  // Suggestions from the liveliest boards for For you: the same for everyone, two minutes at the edge (and in KV).
  // One answer for everyone, kept in KV: a miss walks the boards once for all callers, so it costs a caller little.
  boardpicks: { ttl: 120, stale: 60, cost: 1, run: () => boardPicks() },
  // Margin notes on an article, from anyone.
  notes: { ttl: 120, cost: 2, run: (p) => marginNotes(need(p, 'url')) },
  // Someone's PaperWing profile: their listings and mixes, from their own repo.
  person: {
    ttl: 120,
    cost: 1,
    run: (p) => {
      const actor = actorOf(p.get('actor') ?? '')
      if (!actor) throw new BadRequest('actor (a handle or DID) required')
      return person(actor)
    },
  },
  // Someone's published mix, for its share link and for following it.
  mix: { ttl: 300, run: (p) => readMix(need(p, 'uri')) },
  // Headlines for a search, from any publisher.
  news: { ttl: 900, run: (p) => newsSearch(need(p, 'q')) },
  // Blogs on atproto that found their own way in (Standard.site), from the scheduled crawl's list in KV.
  directory: { ttl: 3600, run: () => directory() },
  // A site's feeds, from any link to it. Sites rarely change their feeds. Up to a dozen whole feeds per call.
  discover: { ttl: 86_400, cost: 5, run: (p) => discoverFeeds(need(p, 'url')) },
  // Who on Bluesky and Frontpage is discussing a link.
  atlinks: { ttl: 600, cost: 1, run: (p) => openNetworkDiscussions(need(p, 'url')) },
  frontpage: { ttl: 300, run: (p) => frontpageFeed(sortOf(p.get('feed'))) },
  arxiv: { ttl: 1800, run: (p) => arxiv(p.get('q') ?? 'cat:cs.AI') },
  hf: { ttl: 1800, run: () => hfPapers() },
  // A site's own favicon, for sources Simple Icons has no logo for. Cached a week; misses for a day.
  // An SVG icon may carry styles, so those are allowed; scripts never are.
  icon: {
    ttl: 0,
    run: (p) =>
      favicon((p.get('d') ?? '').toLowerCase()).then(
        (icon) => inert(icon.body, icon.type, LONG_CACHE, "default-src 'none'; style-src 'unsafe-inline'; sandbox"),
        // The image still fails, so the row falls back to its letter.
        () => nothing('public, s-maxage=86400'),
      ),
  },
  // A link's preview image, as a redirect so the image itself loads straight from the publisher.
  // Only for an <img>: anything else would make this an open redirect off our domain.
  og: {
    ttl: 0,
    run: async (p, request) => {
      if (request.headers.get('sec-fetch-dest') !== 'image') return nothing('no-store', { vary: 'sec-fetch-dest' })
      return ogImage(p.get('url') ?? '').then(
        (image) => new Response(null, { status: 302, headers: { location: image, 'cache-control': LONG_CACHE, vary: 'sec-fetch-dest' } }),
        // Most pages without a preview image are just that.
        () => nothing('public, max-age=86400, s-maxage=86400'),
      )
    },
  },
  releases: { ttl: 3600, cost: (p) => Math.ceil(list(p.get('repos')).length / 8) || 1, run: (p) => releases(list(p.get('repos'))) },
  github: { ttl: 3600, run: (p) => github(p.get('q') ?? 'stars:>50', Number(p.get('days') ?? 7)) },
  // Incidents move fast; two minutes at the edge keeps every status page at one request per region.
  status: { ttl: 120, cost: (p) => 1 + Math.ceil(Math.min(list(p.get('hosts')).length, 25) / 5), run: (p) => statusIncidents(list(p.get('providers')), p.get('active') === '1', list(p.get('hosts'))) },
  // Settings asks before following a page; the answer changes rarely.
  statuscheck: { ttl: 3600, run: (p) => checkStatusPage(p.get('host') ?? '') },
  // One state's WARN notices from employers PaperWing follows. States post new notices a few times a
  // week; their lists are cached in KV for six hours, and here for three. Most states are one or two
  // fetches shared by everyone; the paged ones cost more (WARN_COST).
  warn: {
    ttl: 10_800,
    stale: 86_400,
    cost: (p) => {
      const state = (p.get('state') ?? '').toLowerCase()
      return Object.hasOwn(WARN_COST, state) ? (WARN_COST[state as keyof typeof WARN_COST] ?? 0) : 0
    },
    run: (p) => {
      const state = (p.get('state') ?? '').toLowerCase()
      if (!isState(state)) throw new BadRequest('state (a two-letter code PaperWing reads) required')
      return warnStories(state)
    },
  },
  // What an employer in the news for layoffs is hiring for, from its own job board. Boards change
  // through the day, not by the minute: six hours at the edge, and a stale answer for a day after.
  // One fetch of one job board, so it never counts against the fan-out allowance.
  hiring: {
    ttl: 21_600,
    stale: 86_400,
    run: async (p) => {
      const found = await hiring(need(p, 'employer'))
      if (!found) throw new BadRequest('Not an employer whose job board PaperWing reads')
      return found
    },
  },
}

export async function GET(request: Request): Promise<Response> {
  const p = new URL(request.url).searchParams
  const src = p.get('src') ?? ''
  if (!Object.hasOwn(SOURCES, src)) return fail('unknown src')
  const source = SOURCES[src as FeedSource]
  const cost = typeof source.cost === 'function' ? source.cost(p) : source.cost
  if (cost && (await fanOutLimited(request, cost))) return fail('That was a lot at once. Try again in a minute.', 429)
  try {
    const out = await source.run(p, request)
    return out instanceof Response ? out : json(out, source.ttl, 200, source.stale)
  } catch (err) {
    if (err instanceof StandardRateLimit) return fail(err.message, 429)
    if (err instanceof BadRequest) return fail(err.message)
    return fail(err instanceof Error ? err.message : 'fetch failed', 502)
  }
}
