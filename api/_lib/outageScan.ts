import { UA } from './http.js'
import { detectOutages, PROVIDERS, type Mention, type ProviderReport } from './outages.js'

// The scan behind Outage watch: recent Bluesky posts and HN titles saying a service is down,
// counted per provider, with status pages alongside. Shared by /api/outages and the alert run.

const APPVIEW = 'https://api.bsky.app/xrpc/app.bsky.feed.searchPosts'
const QUERIES = ['"is down"', 'outage', '"down for anyone"', '"not loading"']

interface Post {
  uri: string
  author: { handle: string }
  record: { text: string; createdAt: string }
  indexedAt: string
}

async function blueskyMentions(): Promise<Mention[]> {
  // Results come newest first. The search's own `since` filter drops most matches, so the
  // two-hour window is applied here instead.
  const cutoff = Date.now() - 2 * 3_600_000
  const pages = await Promise.allSettled(
    QUERIES.map(async (q) => {
      const posts: Post[] = []
      let cursor: string | undefined
      for (let page = 0; page < 3; page++) {
        const params = new URLSearchParams({ q, sort: 'latest', lang: 'en', limit: '100', ...(cursor ? { cursor } : {}) })
        const res = await fetch(`${APPVIEW}?${params}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) })
        if (!res.ok) break
        const data = (await res.json()) as { posts: Post[]; cursor?: string }
        posts.push(...data.posts)
        cursor = data.cursor
        const oldest = Date.parse(data.posts[data.posts.length - 1]?.indexedAt ?? '')
        if (!cursor || data.posts.length < 100 || oldest < cutoff) break
      }
      return posts
    }),
  )
  const seen = new Set<string>()
  const out: Mention[] = []
  for (const r of pages) {
    if (r.status !== 'fulfilled') continue
    for (const p of r.value) {
      if (seen.has(p.uri)) continue
      seen.add(p.uri)
      const at = Math.min(Date.parse(p.record.createdAt) || Infinity, Date.parse(p.indexedAt) || Infinity)
      out.push({ text: p.record.text, author: p.author.handle, at, url: `https://bsky.app/profile/${p.author.handle}/post/${p.uri.split('/').pop()}` })
    }
  }
  return out
}

/** HN titles like "GitHub is down" count as several people: they've already cleared the front door. */
async function hnMentions(): Promise<Mention[]> {
  try {
    const since = Math.floor((Date.now() - 2 * 3_600_000) / 1000)
    const res = await fetch(`https://hn.algolia.com/api/v1/search_by_date?tags=story&query=down%20outage&numericFilters=created_at_i>${since}&hitsPerPage=50&optionalWords=down%20outage`, { signal: AbortSignal.timeout(6000) })
    const data = (await res.json()) as { hits: { objectID: string; title: string; created_at_i: number }[] }
    return data.hits.flatMap((h) => [0, 1, 2].map((i) => ({ text: h.title, author: `hn:${h.objectID}:${i}`, at: h.created_at_i * 1000, url: `https://news.ycombinator.com/item?id=${h.objectID}` })))
  } catch {
    return []
  }
}

async function statusOf(host: string): Promise<ProviderReport['status']> {
  try {
    const res = await fetch(`https://${host}/api/v2/status.json`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(4000) })
    const data = (await res.json()) as { status?: { indicator: string; description: string } }
    return data.status ? { ...data.status, url: `https://${host}` } : undefined
  } catch {
    return undefined
  }
}

/** Who people are saying is down right now, with each provider's status page alongside. */
export async function outageReport(): Promise<{ checkedAt: number; scanned: number; providers: ProviderReport[] }> {
  const [bsky, hn] = await Promise.all([blueskyMentions(), hnMentions()])
  const reports = detectOutages([...bsky, ...hn])
  // Status pages for everyone with one: a page admitting trouble is news even without chatter.
  const statuses = await Promise.all(PROVIDERS.map(async (p) => [p.id, p.statuspage ? await statusOf(p.statuspage) : undefined] as const))
  for (const [id, status] of statuses) {
    if (!status) continue
    const r = reports.find((x) => x.id === id)
    if (r) r.status = status
    else if (status.indicator !== 'none') {
      const p = PROVIDERS.find((x) => x.id === id)!
      reports.push({ id, name: p.name, recent: 0, baseline: 0, level: 'quiet', samples: [], status })
    }
  }
  return { checkedAt: Date.now(), scanned: bsky.length, providers: reports.filter((r) => r.recent > 0 || (r.status && r.status.indicator !== 'none')) }
}
