import { AT_MIX, cleanMix, MIX_NSID, type MixRecord, type MixSource } from '../../src/lib/mixSources.js'
import { LEMMY_DEFAULT, LEMMY_INSTANCES, lemmyKey } from '../../src/lib/lemmyKey.js'
import { TOPIC_BY_ID } from '../../src/lib/topics.js'
import type { Story } from '../../src/lib/types.js'
import { linking, posts, variants } from './atlinks.js'
import { postTime, type PostView } from './bsky.js'
import { getRecord, handles, pool } from './frontpage.js'
import { fetchJson } from './http.js'
import { cachedInKv, type Payer } from './kv.js'
import { newsSearch, rss } from './sources.js'
import { standardFeed, StandardRateLimit } from './standard.js'

// Mixes on the server: reading one from its owner's repo (for a share link), and serving one as a
// Bluesky feed. A Bluesky feed can only hold Bluesky posts, so a mix's feed is the posts from its
// Bluesky feeds plus, for each recent story from its other sources, the most-liked Bluesky post
// that shared it (found through Constellation). Built at most every ten minutes per mix.
//
// Anyone can point a feed record at PaperWing's generator, so every mix is checked (cleanMix), its
// sources are capped, and only fixed public hosts and safeFetch-guarded publishers are fetched.

/** A published mix and its author's handle, by at:// URI. */
export async function readMix(uri: string): Promise<{ mix: MixRecord; did: string; handle?: string }> {
  const m = AT_MIX.exec(uri)
  if (!m) throw new Error('Not a PaperWing mix')
  const [record, names] = await Promise.all([getRecord<unknown>(uri), handles([m[1]])])
  const mix = cleanMix(record.value)
  if (!mix) throw new Error('That mix is empty or malformed')
  return { mix, did: m[1], handle: names.get(m[1]) }
}

const APPVIEW = 'https://public.api.bsky.app'

/** Recent link stories from a mix's non-Bluesky sources: a few from each, newest first. */
export async function linkStories(sources: MixSource[], payer?: Payer, onSkipped?: () => void): Promise<Story[]> {
  const jobs: (() => Promise<Story[]>)[] = []
  let limited: StandardRateLimit | undefined
  for (const s of sources) {
    if (s.kind === 'rss') jobs.push(() => rss(s.url, s.label))
    else if (s.kind === 'standard')
      jobs.push(async () => {
        try {
          return await standardFeed(s.url, s.label, payer)
        } catch (err) {
          if (err instanceof StandardRateLimit) limited = err
          throw err
        }
      })
    else if (s.kind === 'news') jobs.push(() => newsSearch(s.q))
    else if (s.kind === 'topic') {
      // A topic brings its first three publishers. (The app reads more for a topic: its HN search,
      // Lemmy community and Bluesky feed. A mix's published feed keeps to its publishers.)
      for (const f of (TOPIC_BY_ID.get(s.id)?.feeds ?? []).filter((f) => f.kind === 'rss').slice(0, 3)) if (f.kind === 'rss') jobs.push(() => rss(f.url, f.label))
    } else if (s.kind === 'lemmy') {
      const via = s.via ?? LEMMY_DEFAULT
      if (!LEMMY_INSTANCES.has(via)) continue
      jobs.push(async () => {
        const { posts: list } = await fetchJson<{
          posts: { post: { id: number; ap_id?: string; url?: string; name: string; published: string; nsfw?: boolean; removed?: boolean; deleted?: boolean } }[]
        }>(`https://${via}/api/v3/post/list?community_name=${encodeURIComponent(s.community)}&sort=TopDay&limit=15&type_=All`, { timeoutMs: 8000 })
        return list.flatMap((v) =>
          // What the app hides (src/lib/sources/lemmy.ts, usable) stays out of a published feed too.
          v.post.url && /^https?:\/\//.test(v.post.url) && !v.post.nsfw && !v.post.removed && !v.post.deleted
            ? [
                {
                  // Keyed as the app keys Lemmy posts, so it opens with its discussion.
                  key: lemmyKey(v.post.id, via),
                  source: 'lemmy',
                  sourceLabel: s.community,
                  title: v.post.name,
                  url: v.post.url,
                  discussionUrl: v.post.ap_id ?? `https://${via}/post/${v.post.id}`,
                  createdAt: Date.parse(v.post.published),
                  hasThread: true,
                } as Story,
              ]
            : [],
        )
      })
    }
  }
  const results = await pool(jobs.slice(0, 16), 6, (job) => job())
  // A reader over their allowance is told so; a mix Bluesky reads goes without what it can't afford this minute.
  if (limited && payer instanceof Request) throw limited
  if (limited) onSkipped?.()
  const seen = new Set<string>()
  return results
    .flatMap((r) => (r ?? []).slice(0, 10))
    .filter((s) => s.url && !seen.has(s.url) && !!seen.add(s.url))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 40)
}

/** The most-liked Bluesky post sharing a link as a card, if anyone has. */
async function bestPostFor(url: string): Promise<string[]> {
  const uris: string[] = []
  for (const target of variants(url)) uris.push(...(await linking(target, 'app.bsky.feed.post', '.embed.external.uri', 10).catch(() => [])))
  return uris
}

async function buildMixFeed(did: string, rkey: string, payer?: Payer, onSkipped?: () => void): Promise<string[]> {
  const { mix } = await readMix(`at://${did}/${MIX_NSID}/${rkey}`)
  const feeds = mix.sources.filter((s): s is Extract<MixSource, { kind: 'bskyFeed' }> => s.kind === 'bskyFeed').slice(0, 6)
  const [fromFeeds, stories] = await Promise.all([
    pool(feeds, 3, (f) =>
      fetchJson<{ feed: { post: PostView }[] }>(
        f.uri.includes('/app.bsky.graph.list/')
          ? `${APPVIEW}/xrpc/app.bsky.feed.getListFeed?list=${encodeURIComponent(f.uri)}&limit=40`
          : `${APPVIEW}/xrpc/app.bsky.feed.getFeed?feed=${encodeURIComponent(f.uri)}&limit=40`,
        { timeoutMs: 8000 },
      ),
    ),
    linkStories(mix.sources, payer, onSkipped),
  ])
  // For each story, every post that shared it; then the most liked of those, one per story.
  const sharing = await pool(stories, 8, (s) => bestPostFor(s.url!))
  const candidates = [...new Set(sharing.flatMap((u) => u ?? []))].slice(0, 200)
  const hydrated = new Map((await posts(candidates)).map((p) => [p.uri, p]))
  const picks: PostView[] = []
  for (const uris of sharing) {
    const best = (uris ?? [])
      .map((u) => hydrated.get(u))
      .filter((p): p is PostView => !!p)
      .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))[0]
    if (best) picks.push(best)
  }
  const all = [...fromFeeds.flatMap((r) => (r?.feed ?? []).map((i) => i.post)), ...picks]
  const seen = new Set<string>()
  return all
    .filter((p) => !seen.has(p.uri) && !!seen.add(p.uri))
    .sort((a, b) => postTime(b) - postTime(a))
    .slice(0, 100)
    .map((p) => p.uri)
}

/** A mix's feed, from the cache when it's under ten minutes old; one built without a source it couldn't afford, for a minute. */
export async function mixFeed(did: string, rkey: string, payer?: Payer): Promise<string[]> {
  let partial = false
  return cachedInKv(
    `rd:mixfeed:${did}:${rkey}`,
    () => (partial ? 60 : 600),
    () => buildMixFeed(did, rkey, payer, () => (partial = true)),
  )
}
