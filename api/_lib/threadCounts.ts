import { parseStoryKey } from '../../src/lib/storyKey.js'
import { parseLemmyKey } from '../../src/lib/lemmyKey.js'
import { assertPublicUrl, fetchJson } from './http.js'

// How many comments a thread has right now, by its story key, for reply alerts on watched
// threads. One small request per thread; sources without a count (blogs, status pages) have none.

export const countable = (key: string) => /^(hn|lb|dv|bs|lm|md)-/.test(key)

export async function commentCount(key: string): Promise<number | undefined> {
  const p = parseStoryKey(key)
  const opts = { timeoutMs: 5000 }
  switch (p?.kind) {
    case 'hn':
      return (await fetchJson<{ descendants?: number }>(`https://hacker-news.firebaseio.com/v0/item/${encodeURIComponent(p.id)}.json`, opts)).descendants
    case 'lb':
      return (await fetchJson<{ comment_count?: number }>(`https://lobste.rs/s/${encodeURIComponent(p.id)}.json`, opts)).comment_count
    case 'dv':
      return (await fetchJson<{ comments_count?: number }>(`https://dev.to/api/articles/${encodeURIComponent(p.id)}`, opts)).comments_count
    case 'bs': {
      const uri = p.uri
      const { posts } = await fetchJson<{ posts: { replyCount?: number }[] }>(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`, opts)
      return posts[0]?.replyCount
    }
    case 'lm': {
      const lm = parseLemmyKey(key)
      return lm ? (await fetchJson<{ post_view: { counts: { comments: number } } }>(`https://${lm.via}/api/v3/post?id=${lm.id}`, opts)).post_view.counts.comments : undefined
    }
    case 'md': {
      // md-<server>-<status id>: the server is whoever the reader signed in to, so check it's public.
      const host = p.instance
      const status = p.id
      if (!/^[a-z0-9.-]+$/.test(host) || !/^\w+$/.test(status)) return undefined
      await assertPublicUrl(`https://${host}/`)
      return (await fetchJson<{ replies_count?: number }>(`https://${host}/api/v1/statuses/${status}`, { ...opts, redirect: 'error' })).replies_count
    }
    default:
      return undefined
  }
}

/**
 * The server a reader chose for a thread (a Mastodon server: anyone's, and possibly slow on
 * purpose), which gets a cap. The networks everyone shares (HN, Bluesky, Lobsters, the known Lemmy
 * servers) aren't capped: they're fast, and a long watch list needs all the workers.
 */
const chosenServer = (key: string) => {
  const p = parseStoryKey(key)
  return p?.kind === 'md' ? p.instance : undefined
}

/**
 * Counts for many threads, a few at a time. A thread that can't be read is left out.
 *
 * A Mastodon thread lives on whatever server its reader picked, and a server can be slow on purpose.
 * So no such server gets more than two requests at once, the networks everyone shares go first, and the
 * whole thing stops at its time budget with what it has: an alert run has to finish within its
 * function's limit, however many threads are watched on slow servers.
 */
export async function commentCounts(keys: string[], { concurrency = 8, budgetMs = 20_000, perHost = 2 } = {}): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const unique = [...new Set(keys.filter(countable))]
  const queue = [...unique.filter((k) => !k.startsWith('md-')), ...unique.filter((k) => k.startsWith('md-'))]
  const busy = new Map<string, number>()
  const stopAt = Date.now() + budgetMs
  const next = () => {
    const i = queue.findIndex((k) => {
      const host = chosenServer(k)
      return !host || (busy.get(host) ?? 0) < perHost
    })
    return i < 0 ? undefined : queue.splice(i, 1)[0]
  }
  const worker = async () => {
    for (let key = next(); key && Date.now() < stopAt; key = next()) {
      const host = chosenServer(key)
      if (host) busy.set(host, (busy.get(host) ?? 0) + 1)
      const n = await commentCount(key).catch(() => undefined)
      if (host) busy.set(host, busy.get(host)! - 1)
      if (typeof n === 'number') out.set(key, n)
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker)), new Promise((done) => (timer = setTimeout(done, budgetMs)))])
  clearTimeout(timer)
  // A copy: requests still in flight past the budget mustn't change what the caller already has.
  return new Map(out)
}
