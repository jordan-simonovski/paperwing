import type { Story } from '../../src/lib/types.js'
import { toStory, type PostView } from './bsky.js'
import { frontpageStories } from './frontpage.js'
import { fetchJson } from './http.js'

// Who on the open atproto network is talking about a link: every Bluesky post that shared it (as a
// link card or a link in the text) and every Frontpage post of it, found through Constellation's
// index of links between records, then read from Bluesky's public API and from Frontpage
// members' own servers. No account or search API needed, and nothing is missed for being worded
// differently.

const CONSTELLATION = 'https://constellation.microcosm.blue'
const APPVIEW = 'https://public.api.bsky.app'
export const BSKY_PATHS = /^\.(embed(\.media)?\.external\.uri|facets\[.*\]\.features\[app\.bsky\.richtext\.facet#link\]\.uri)$/
const FRONTPAGE: Record<string, string> = { 'fyi.unravel.frontpage.post': '.url', 'fyi.frontpage.feed.post': '.subject.url' }

type Links = Record<string, Record<string, { records: number; distinct_dids: number }>>

/** The same link as people paste it: with and without a trailing slash. */
export function variants(url: string): string[] {
  const u = url.trim()
  return [...new Set([u, u.endsWith('/') ? u.slice(0, -1) : `${u}/`])]
}

export async function linking(target: string, collection: string, path: string, limit = 50): Promise<string[]> {
  const res = await fetchJson<{ linking_records: { did: string; collection: string; rkey: string }[] }>(
    `${CONSTELLATION}/links?target=${encodeURIComponent(target)}&collection=${collection}&path=${encodeURIComponent(path)}&limit=${limit}`,
    { timeoutMs: 8000 },
  )
  return res.linking_records.map((r) => `at://${r.did}/${r.collection}/${r.rkey}`)
}

/** Bluesky posts by URI, 25 at a time, from the public AppView. */
export async function posts(uris: string[]): Promise<PostView[]> {
  const out: PostView[] = []
  for (let i = 0; i < uris.length; i += 25) {
    const qs = uris
      .slice(i, i + 25)
      .map((u) => `uris=${encodeURIComponent(u)}`)
      .join('&')
    const res = await fetchJson<{ posts: PostView[] }>(`${APPVIEW}/xrpc/app.bsky.feed.getPosts?${qs}`, { timeoutMs: 8000 }).catch(() => ({ posts: [] }))
    out.push(...res.posts)
  }
  return out
}

/** Places this link is being discussed on atproto: Bluesky posts with replies, best first, and Frontpage posts. */
export async function openNetworkDiscussions(url: string): Promise<Story[]> {
  if (!/^https?:\/\/[^\s]{4,2000}$/.test(url)) throw new Error('url must be an http(s) link')
  const bsky = new Set<string>()
  const frontpage = new Set<string>()
  for (const target of variants(url)) {
    const { links } = await fetchJson<{ links: Links }>(`${CONSTELLATION}/links/all?target=${encodeURIComponent(target)}`, { timeoutMs: 8000 }).catch(() => ({ links: {} as Links }))
    const lookups: Promise<void>[] = []
    for (const path of Object.keys(links['app.bsky.feed.post'] ?? {}))
      if (BSKY_PATHS.test(path))
        lookups.push(
          linking(target, 'app.bsky.feed.post', path).then(
            (u) => u.forEach((x) => bsky.add(x)),
            () => {},
          ),
        )
    for (const [collection, path] of Object.entries(FRONTPAGE))
      if (links[collection]?.[path])
        lookups.push(
          linking(target, collection, path, 10).then(
            (u) => u.forEach((x) => frontpage.add(x)),
            () => {},
          ),
        )
    await Promise.all(lookups)
  }
  const [found, fp] = await Promise.all([posts([...bsky].slice(0, 100)), frontpageStories([...frontpage]).catch(() => [])])
  // A post nobody replied to is a share, not a discussion: keep the ones with replies, busiest first.
  const discussed = found
    .filter((p) => (p.replyCount ?? 0) > 0)
    .sort((a, b) => (b.replyCount ?? 0) - (a.replyCount ?? 0) || (b.likeCount ?? 0) - (a.likeCount ?? 0))
    .slice(0, 6)
    .map(toStory)
  return [...fp, ...discussed]
}
