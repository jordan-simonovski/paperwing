import { BSKY_FEED_BY_RKEY, BSKY_FEEDS } from '../src/lib/bskyFeeds.js'
import { authConfigured, buildFeed, searchStories, toStory, whyKept } from './_lib/bsky.js'
import { resolveTxt } from 'node:dns/promises'
import { fail, fetchJson, fetchText, json } from './_lib/http.js'
import { fanOutLimited } from './_lib/kv.js'
import { mixFeed, MixSourceError } from './_lib/mixfeed.js'
import { paperwingFeedUris } from './_lib/paperwing.js'
import type { PaperwingSort } from '../src/lib/paperwing.js'
import { clientMetadata, HOME, HOSTS } from '../src/lib/oauthClient.js'

// Bluesky feed generator. vercel.json rewrites /.well-known/did.json and /xrpc/<method> here.
// Spec: https://docs.bsky.app/docs/starter-templates/custom-feeds

/** The address this request came to, when it's one of PaperWing's; home otherwise (previews, localhost). */
function servedHost(request: Request): string {
  const host = (request.headers.get('x-forwarded-host') || new URL(request.url).host).toLowerCase()
  return HOSTS.includes(host) ? host : HOME
}

let publisher: Promise<string | undefined> | undefined
/**
 * The DID of the account the feeds are published under; their at:// URIs live in its repo.
 * Undefined when no account is set; rejects when the handle can't be looked up right now, which
 * isn't the same thing: answering "no feeds" then would be cached for hours.
 */
function publisherDid(): Promise<string | undefined> {
  if (process.env.BSKY_DID) return Promise.resolve(process.env.BSKY_DID)
  const handle = process.env.BSKY_HANDLE
  if (!handle) return Promise.resolve(undefined)
  publisher ??= fetchJson<{ did: string }>(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`)
    .then((r) => r.did)
    .catch((err: unknown) => {
      publisher = undefined
      throw err
    })
  return publisher
}

/** PaperWing's own front page, published as Bluesky feeds (publish-feeds picks these up from the status route). */
const PAPERWING_FEEDS: Record<string, { sort: PaperwingSort; displayName: string; description: string }> = {
  paperwing: {
    sort: 'hot',
    displayName: 'PaperWing',
    description: 'The links people are submitting to PaperWing, ranked like Hacker News: votes are likes, comments are replies. Submit from paperwing.io.',
  },
  'paperwing-new': { sort: 'new', displayName: 'PaperWing New', description: 'Every link submitted to PaperWing, newest first. Submit from paperwing.io.' },
}

/** The account @paperwing.io belongs to. */
const HANDLE_DID = 'did:plc:eprq6bm2okrgk6zsoka2wpux'

const xrpcError = (error: string, message: string, status = 400) =>
  new Response(JSON.stringify({ error, message }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const p = url.searchParams
  // Rewrites pass the route as ?route=; fall back to the path so a direct call works too.
  const route = p.get('route') ?? (url.pathname.endsWith('/.well-known/did.json') ? 'did' : url.pathname.split('/xrpc/')[1]) ?? ''

  try {
    switch (route) {
      // A did:web document must name the address it's fetched from: paperwing.io and the old
      // vercel.app address each answer for themselves, so feeds published under either keep working.
      case 'did': {
        const host = servedHost(request)
        return json({ '@context': ['https://www.w3.org/ns/did/v1'], id: `did:web:${host}`, service: [{ id: '#bsky_fg', type: 'BskyFeedGenerator', serviceEndpoint: `https://${host}` }] }, 3600)
      }

      case 'app.bsky.feed.describeFeedGenerator': {
        const did = await publisherDid()
        return json(
          {
            did: `did:web:${servedHost(request)}`,
            feeds: did ? [...BSKY_FEEDS.map((f) => f.rkey), ...Object.keys(PAPERWING_FEEDS)].map((rkey) => ({ uri: `at://${did}/app.bsky.feed.generator/${rkey}` })) : [],
          },
          3600,
        )
      }

      case 'app.bsky.feed.getFeedSkeleton': {
        const feedUri = p.get('feed') ?? ''
        const m = feedUri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.generator\/([^/]+)$/)
        const limit = Math.min(100, Math.max(1, Number(p.get('limit') ?? 50) || 50))
        const offset = Math.max(0, Number(p.get('cursor') ?? 0) || 0)
        // A reader's mix, published as a Bluesky feed from their own account (api/_lib/mixfeed.ts).
        const mixRkey = m?.[2].match(/^pw-([a-z2-7]{13})$/)?.[1]
        // PaperWing's own front page, as Bluesky feeds: the submitted posts, ranked.
        if (m && PAPERWING_FEEDS[m[2]]) {
          const uris = await paperwingFeedUris(PAPERWING_FEEDS[m[2]].sort)
          const next = offset + limit < uris.length ? String(offset + limit) : undefined
          return json({ feed: uris.slice(offset, offset + limit).map((post) => ({ post })), ...(next ? { cursor: next } : {}) }, 60)
        }
        if (m && mixRkey) {
          // A feed whose mix was deleted or never existed is an unknown feed to Bluesky, not a server error.
          // Bluesky asks for every mix from a few shared addresses: cold reads are charged to the mix's author.
          const uris = await mixFeed(m[1], mixRkey, { mix: m[1] }).catch((err: Error) => err)
          if (uris instanceof MixSourceError) return xrpcError('UpstreamFailure', uris.message, 502)
          if (uris instanceof Error) return xrpcError('UnknownFeed', `No PaperWing mix behind this feed: ${uris.message}`)
          const next = offset + limit < uris.length ? String(offset + limit) : undefined
          return json({ feed: uris.slice(offset, offset + limit).map((post) => ({ post })), ...(next ? { cursor: next } : {}) }, 120)
        }
        if (!m || !BSKY_FEED_BY_RKEY.has(m[2])) return xrpcError('UnknownFeed', `Unknown feed ${feedUri}`)
        // Feeds published by the configured account, or by @paperwing.io itself. When the account
        // can't be looked up just now, the feed is still served: readers shouldn't see a blip.
        const owner = await publisherDid().catch(() => undefined)
        if (owner && m[1] !== owner && m[1] !== HANDLE_DID) return xrpcError('UnknownFeed', 'This generator only serves feeds published by its owner')
        const posts = await buildFeed(m[2])
        const page = posts.slice(offset, offset + limit)
        const next = offset + limit < posts.length ? String(offset + limit) : undefined
        // Offsets index a list rebuilt every two minutes, so a deep page can repeat or skip a post; acceptable for a ranked feed.
        return json({ feed: page.map((post) => ({ post: post.uri })), ...(next ? { cursor: next } : {}) }, 60)
      }

      // paperwing.io is PaperWing's own Bluesky handle: the well-known file says which account it
      // belongs to (the _atproto DNS record says the same). Other addresses aren't handles.
      case 'atproto-did':
        return servedHost(request) === HOME
          ? new Response(HANDLE_DID, { headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=3600' } })
          : new Response('Not found', { status: 404 })

      // The sign-in metadata for this address (src/lib/oauthClient.ts): the app on each of PaperWing's
      // addresses signs in as itself.
      case 'client-metadata':
        return json(clientMetadata(`https://${servedHost(request)}`), 300)

      // PaperWing's own read of a feed: the same ranked posts, as stories.
      case 'stories': {
        const feed = p.get('feed') ?? 'tech'
        if (!BSKY_FEED_BY_RKEY.has(feed)) return fail('unknown feed')
        const posts = (await buildFeed(feed)).slice(0, 80)
        // ?why=1 shows which strong terms let each post in, for tuning a feed's precision.
        if (p.get('why'))
          return json(
            posts.map((post) => ({ title: toStory(post).title.slice(0, 90), why: whyKept(post) })),
            0,
          )
        return json(posts.map(toStory), 120)
      }

      // Handle to DID, for signing in (src/lib/atproto.ts): our own resolver, so signing in doesn't
      // tell a third party who's asking. DNS first, then the handle's well-known file.
      case 'com.atproto.identity.resolveHandle': {
        const handle = (p.get('handle') ?? '').trim().toLowerCase()
        if (!HANDLE.test(handle)) return xrpcError('InvalidRequest', 'Not a valid handle')
        const did = await resolveHandle(handle)
        return did ? json({ did }, 300) : xrpcError('HandleNotFound', `Couldn't find ${handle}`)
      }

      // A reader's search: posts matching the query, from Bluesky's own search.
      case 'search': {
        const q = (p.get('q') ?? '').trim().slice(0, 120)
        if (!q) return fail('q required')
        // Searches as PaperWing's own account when it has one, so a stranger mustn't be able to spend it.
        if (await fanOutLimited(request, 1)) return fail('That was a lot at once. Try again in a minute.', 429)
        const days = Number(p.get('days')) || undefined
        return json(await searchStories(q, days && days > 0 && days <= 3650 ? days : undefined, p.get('sort') === 'new' ? 'latest' : 'top'), 300)
      }

      case 'status':
        return json(
          {
            enabled: process.env.BSKY_DISABLED !== '1',
            authenticated: authConfigured(),
            publisher: (await publisherDid()) ?? null,
            did: `did:web:${servedHost(request)}`,
            feeds: [
              ...Object.entries(PAPERWING_FEEDS).map(([rkey, f]) => ({ rkey, displayName: f.displayName, description: f.description })),
              ...BSKY_FEEDS.map((f) => ({ rkey: f.rkey, displayName: f.displayName, description: f.description })),
            ],
          },
          300,
        )

      default:
        return xrpcError('MethodNotImplemented', `Method not implemented: ${route}`, 501)
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'atproto failed', 502)
  }
}

/** A handle: a domain name of at least two labels. */
const HANDLE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const DID = /^did:(plc:[a-z2-7]{24}|web:[a-z0-9.:%-]+)$/

export async function resolveHandle(handle: string): Promise<string | undefined> {
  try {
    for (const record of await resolveTxt(`_atproto.${handle}`)) {
      const value = record.join('')
      if (value.startsWith('did=') && DID.test(value.slice(4))) return value.slice(4)
    }
  } catch {
    /* no DNS record: try the well-known file */
  }
  try {
    const { text } = await fetchText(`https://${handle}/.well-known/atproto-did`, { maxBytes: 2048, timeoutMs: 5000 })
    const did = text.trim()
    return DID.test(did) ? did : undefined
  } catch {
    return undefined
  }
}
