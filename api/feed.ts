import { fail, json } from './_lib/http.js'
import { discoverFeeds } from './_lib/discover.js'
import { favicon } from './_lib/icon.js'
import { frontpageActivity, frontpageFeed } from './_lib/frontpage.js'
import { openNetworkDiscussions } from './_lib/atlinks.js'
import { cardImage, ogImage, pageCard } from './_lib/og.js'
import { readMix } from './_lib/mixfeed.js'
import { paperwingFront } from './_lib/paperwing.js'
import { actorOf, person } from './_lib/people.js'
import { marginNotes } from './_lib/notes.js'
import { allBoards, boardFront } from './_lib/boards.js'
import { arxiv, github, hfPapers, lobsters, newsSearch, releases, rss } from './_lib/sources.js'
import { checkStatusPage, statusIncidents } from './_lib/statuspages.js'

// One function for every server-fetched source keeps us well under Vercel Hobby's function limit.
export async function GET(request: Request): Promise<Response> {
  const p = new URL(request.url).searchParams
  const src = p.get('src')
  try {
    switch (src) {
      case 'lobsters':
        return json(await lobsters(p.get('path') ?? 'hottest'), 300)
      case 'rss': {
        const url = p.get('url')
        return url ? json(await rss(url, p.get('label') ?? undefined), 900) : fail('url required')
      }
      case 'card': {
        // A link card's words, for sharing a story to Bluesky: a day at the edge.
        const url = p.get('url')
        return url ? json(await pageCard(url).catch(() => ({})), 86_400) : fail('url required')
      }
      case 'cardimage': {
        // The card's picture as bytes, so the app can upload it to the reader's own repo. Served
        // with the image's own type, sandboxed like icons, and only small pictures.
        try {
          const { body, type } = await cardImage(p.get('url') ?? '')
          return new Response(body, {
            headers: { 'content-type': type, 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" },
          })
        } catch {
          return new Response(null, { status: 204, headers: { 'cache-control': 'public, max-age=3600' } })
        }
      }
      case 'paperwing': {
        // PaperWing's front page or one board: a minute at the edge (and in KV).
        const sort = p.get('sort')
        const board = p.get('board') ?? undefined
        return json(await paperwingFront(sort === 'new' || sort === 'top' ? sort : 'hot', board && /^[a-z0-9-]{1,40}$/.test(board) ? board : undefined), 60)
      }
      case 'fpactivity': {
        // A member's Frontpage posts, comments and the replies to them: a minute at the edge.
        const did = p.get('did')
        return did ? json(await frontpageActivity(did), 60) : fail('did required')
      }
      case 'board': {
        // A community board and its listings: a minute at the edge (and in KV).
        const did = p.get('did') ?? ''
        const rkey = p.get('rkey') ?? ''
        const sort = p.get('sort')
        return json(await boardFront(did, rkey, sort === 'new' || sort === 'top' ? sort : 'hot'), 60)
      }
      case 'boards':
        // Every community board, for Explore: five minutes at the edge.
        return json(await allBoards(), 300)
      case 'notes': {
        // Margin notes on an article, from anyone: two minutes at the edge.
        const url = p.get('url')
        return url ? json(await marginNotes(url), 120) : fail('url required')
      }
      case 'person': {
        // Someone's PaperWing profile: their listings and mixes, from their own repo. Two minutes at the edge.
        const actor = actorOf(p.get('actor') ?? '')
        return actor ? json(await person(actor), 120) : fail('actor (a handle or DID) required')
      }
      case 'mix': {
        // Someone's published mix, for its share link and for following it: five minutes at the edge.
        const uri = p.get('uri')
        return uri ? json(await readMix(uri), 300) : fail('uri required')
      }
      case 'news': {
        // Headlines for a search, from any publisher: fifteen minutes at the edge.
        const q = p.get('q')
        return q ? json(await newsSearch(q), 900) : fail('q required')
      }
      case 'discover': {
        // A site's feeds, from any link to it. Sites rarely change their feeds; a day at the edge.
        const url = p.get('url')
        return url ? json(await discoverFeeds(url), 86_400) : fail('url required')
      }
      case 'atlinks': {
        // Who on Bluesky and Frontpage is discussing a link.
        const url = p.get('url')
        return url ? json(await openNetworkDiscussions(url), 600) : fail('url required')
      }
      case 'frontpage': {
        const feed = p.get('feed')
        return json(await frontpageFeed(feed === 'new' || feed === 'top' ? feed : 'hot'), 300)
      }
      case 'arxiv':
        return json(await arxiv(p.get('q') ?? 'cat:cs.AI'), 1800)
      case 'hf':
        return json(await hfPapers(), 1800)
      case 'icon': {
        // A site's own favicon, for sources Simple Icons has no logo for. Cached a week; misses for a day.
        try {
          const icon = await favicon((p.get('d') ?? '').toLowerCase())
          // Served from our own origin, so an SVG icon must never run as a page: someone could put a
          // script in theirs and link people straight to it. The sandbox makes it inert.
          return new Response(icon.body, {
            headers: {
              'content-type': icon.type,
              'cache-control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
              'x-content-type-options': 'nosniff',
              'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            },
          })
        } catch {
          // No icon is an answer, not an error: 204 keeps misses out of the error rate, and the
          // image still fails, so the row falls back to its letter.
          return new Response(null, { status: 204, headers: { 'cache-control': 'public, s-maxage=86400' } })
        }
      }
      case 'og': {
        // A link's preview image, as a redirect so the image itself loads straight from the publisher.
        // Only for an <img>: anything else would make this an open redirect off our domain.
        if (request.headers.get('sec-fetch-dest') !== 'image') return new Response(null, { status: 204, headers: { 'cache-control': 'no-store', vary: 'sec-fetch-dest' } })
        try {
          const image = await ogImage(p.get('url') ?? '')
          return new Response(null, { status: 302, headers: { location: image, 'cache-control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000', vary: 'sec-fetch-dest' } })
        } catch {
          // Most pages without a preview image are just that; 204 says so without counting as an error.
          return new Response(null, { status: 204, headers: { 'cache-control': 'public, max-age=86400, s-maxage=86400' } })
        }
      }
      case 'releases':
        return json(await releases((p.get('repos') ?? '').split(',').filter(Boolean)), 3600)
      case 'github':
        return json(await github(p.get('q') ?? 'stars:>50', Number(p.get('days') ?? 7)), 3600)
      case 'status':
        // Incidents move fast; two minutes at the edge keeps every status page at one request per region.
        return json(await statusIncidents((p.get('providers') ?? '').split(',').filter(Boolean), p.get('active') === '1', (p.get('hosts') ?? '').split(',').filter(Boolean)), 120)
      case 'statuscheck':
        // Settings asks before following a page; the answer changes rarely.
        return json(await checkStatusPage(p.get('host') ?? ''), 3600)
      default:
        return fail('unknown src')
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'fetch failed', 502)
  }
}
