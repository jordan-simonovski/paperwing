import { parseLemmyKey } from '../../src/lib/lemmyKey.js'
import { assertPublicUrl, fetchJson } from './http.js'

// How many comments a thread has right now, by its story key, for reply alerts on watched
// threads. One small request per thread; sources without a count (blogs, status pages) have none.

const fromB64 = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')

export const countable = (key: string) => /^(hn|lb|dv|bs|lm|md)-/.test(key)

export async function commentCount(key: string): Promise<number | undefined> {
  const id = key.slice(3)
  const opts = { timeoutMs: 5000 }
  switch (key.slice(0, 2)) {
    case 'hn':
      return (await fetchJson<{ descendants?: number }>(`https://hacker-news.firebaseio.com/v0/item/${encodeURIComponent(id)}.json`, opts)).descendants
    case 'lb':
      return (await fetchJson<{ comment_count?: number }>(`https://lobste.rs/s/${encodeURIComponent(id)}.json`, opts)).comment_count
    case 'dv':
      return (await fetchJson<{ comments_count?: number }>(`https://dev.to/api/articles/${encodeURIComponent(id)}`, opts)).comments_count
    case 'bs': {
      const uri = fromB64(id)
      if (!uri.startsWith('at://')) return undefined
      const { posts } = await fetchJson<{ posts: { replyCount?: number }[] }>(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`, opts)
      return posts[0]?.replyCount
    }
    case 'lm': {
      const lm = parseLemmyKey(key)
      return lm ? (await fetchJson<{ post_view: { counts: { comments: number } } }>(`https://${lm.via}/api/v3/post?id=${lm.id}`, opts)).post_view.counts.comments : undefined
    }
    case 'md': {
      // md-<server>-<status id>: the server is whoever the reader signed in to, so check it's public.
      const at = id.lastIndexOf('-')
      const host = id.slice(0, at)
      const status = id.slice(at + 1)
      if (!/^[a-z0-9.-]+$/.test(host) || !/^\w+$/.test(status)) return undefined
      await assertPublicUrl(`https://${host}/`)
      return (await fetchJson<{ replies_count?: number }>(`https://${host}/api/v1/statuses/${status}`, { ...opts, redirect: 'error' })).replies_count
    }
    default:
      return undefined
  }
}

/** Counts for many threads, a few at a time. A thread that can't be read is left out. */
export async function commentCounts(keys: string[], concurrency = 8): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const queue = [...new Set(keys.filter(countable))]
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (let key = queue.shift(); key; key = queue.shift()) {
        const n = await commentCount(key).catch(() => undefined)
        if (typeof n === 'number') out.set(key, n)
      }
    }),
  )
  return out
}
