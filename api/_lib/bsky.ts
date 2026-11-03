import { storyKey } from '../../src/lib/storyKey.js'
import { BSKY_FEED_BY_RKEY, BSKY_FEEDS, isOffTopic, searchQueries, strongHits, strongTerms, type BskyFeedDef } from '../../src/lib/bskyFeeds.js'
import { isGifLink, postMedia, postWords, quotedPost, selfPostOf, sharedLink, type Shareable } from '../../src/lib/bskyPost.js'
import type { Story } from '../../src/lib/types.js'
import { UA } from './http.js'
import { escapeHtml } from './text.js'

/* ------------------------------------------------------------------ types */

interface ExternalView {
  uri: string
  title?: string
  description?: string
  thumb?: string
}
export interface PostView {
  uri: string
  cid: string
  author: { did: string; handle: string; displayName?: string; labels?: { src?: string; val: string }[] }
  record: Shareable['record'] & { createdAt: string; reply?: unknown; langs?: string[] }
  embed?: Shareable['embed']
  labels?: { src?: string; val: string }[]
  likeCount?: number
  repostCount?: number
  replyCount?: number
  quoteCount?: number
  indexedAt: string
}

/* ------------------------------------------------------------ search auth */

// Search on api.bsky.app currently answers without auth. If Bluesky locks it down, an app password
// (BSKY_HANDLE + BSKY_APP_PASSWORD) routes searches through the account's PDS instead.
const PUBLIC_APPVIEW = 'https://api.bsky.app'
let session: { accessJwt: string; did: string; service: string; expires: number } | undefined

async function getSession() {
  const identifier = process.env.BSKY_HANDLE
  const password = process.env.BSKY_APP_PASSWORD
  if (!identifier || !password) return undefined
  if (session && session.expires > Date.now()) return session
  const service = process.env.BSKY_SERVICE || 'https://bsky.social'
  const res = await fetch(`${service}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify({ identifier, password }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Bluesky login failed (${res.status}). Check BSKY_HANDLE and BSKY_APP_PASSWORD.`)
  const data = (await res.json()) as { accessJwt: string; did: string }
  // Access tokens last about two hours; renew well before that.
  session = { accessJwt: data.accessJwt, did: data.did, service, expires: Date.now() + 90 * 60_000 }
  return session
}

export const authConfigured = () => !!(process.env.BSKY_HANDLE && process.env.BSKY_APP_PASSWORD)

async function searchPosts(q: string, sinceHours?: number, sort: 'top' | 'latest' = 'top'): Promise<PostView[]> {
  const params = new URLSearchParams({ q, sort, lang: 'en', limit: '100' })
  if (sinceHours) params.set('since', new Date(Date.now() - sinceHours * 3_600_000).toISOString())
  const auth = await getSession()
  const base = auth ? auth.service : PUBLIC_APPVIEW
  const res = await fetch(`${base}/xrpc/app.bsky.feed.searchPosts?${params}`, {
    headers: { 'user-agent': UA, ...(auth ? { authorization: `Bearer ${auth.accessJwt}` } : {}) },
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status === 401 && auth) session = undefined
  if (!res.ok) throw new Error(auth ? `Bluesky search ${res.status}` : `Bluesky search ${res.status}. Set BSKY_HANDLE and BSKY_APP_PASSWORD to search as your account.`)
  return ((await res.json()) as { posts: PostView[] }).posts
}

/* --------------------------------------------------------- filter and rank */

const STATUS_RELAY = /^\s*(⚠️|✅|🔴|🟠|🟡|🟢|🚨)\s*.{0,60}\b(is reporting|status|incident|outage|minor issue|major issue|resolved)\b/i
const STATUS_LINE = /\bstatus:\s*(minor|major|partial|degraded)\b|\b(minor|major) (issue|outage) (detected|at)\b/i
const nonLatinShare = (text: string) => {
  const letters = text.match(/\p{L}/gu) ?? []
  return letters.length ? letters.filter((c) => !/\p{Script=Latin}/u.test(c)).length / letters.length : 0
}
const JOB_BOARD = /(\/\/careers?\.|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|linkedin\.com\/jobs|indeed\.|glassdoor\.|wellfound\.com|smartrecruiters\.com|\/\/jobs?\.|\/careers?\/)/i
const HIRING = /(we('|\u2019)?re hiring|is hiring|apply (now|here|today)|job (opening|alert|posting)|\$\d[\d,.]*\s*[-–]\s*\$?\d[\d,.]*\s*\/\s*(hr|hour)|\(w\/m\/d|stellenanzeige)/i

const HIDE_LABELS = new Set(['porn', 'sexual', 'nudity', 'graphic-media', 'gore', '!hide', '!warn', 'spam'])

function external(p: PostView): ExternalView | undefined {
  const card =
    p.embed?.$type === 'app.bsky.embed.external#view'
      ? p.embed.external
      : p.embed?.$type === 'app.bsky.embed.recordWithMedia#view' && p.embed.media?.$type === 'app.bsky.embed.external#view'
        ? p.embed.media.external
        : undefined
  // A reaction GIF's card says nothing about the post.
  return card && !isGifLink(card.uri) ? card : undefined
}

export function postText(p: PostView): string {
  const ext = external(p)
  let host = ''
  try {
    host = ext ? new URL(ext.uri).hostname : ''
  } catch {
    /* ignore */
  }
  return [p.record.text, ext?.title, ext?.description, host].filter(Boolean).join(' ')
}

/** Never trust a future-dated record: take the earlier of the claimed and indexed times. */
export const postTime = (p: PostView) => Math.min(Date.parse(p.record.createdAt) || Infinity, Date.parse(p.indexedAt) || Infinity)

/** The checks every post has to pass, feed or search: no replies, English, no spam, bots, status relays or job ads. */
function presentable(p: PostView): boolean {
  if (p.record.reply) return false
  // Search's lang filter is loose; trust the post's own language tags when it has them.
  if (p.record.langs?.length && !p.record.langs.some((l) => l.toLowerCase().startsWith('en'))) return false
  if ([...(p.labels ?? []), ...(p.author.labels ?? [])].some((l) => HIDE_LABELS.has(l.val))) return false
  if ((p.record.text.match(/#\w+/g) ?? []).length > 5) return false
  // Status pages and auto-posting bots repeat themselves; people discussing an outage still get in.
  if (/(^|[.-])(status|bot|alerts?)([.-]|$)/i.test(p.author.handle) || /\b(status|bot)\b/i.test(p.author.displayName ?? '')) return false
  const full = postText(p)
  if (STATUS_RELAY.test(p.record.text) || STATUS_LINE.test(full)) return false
  // Job ads match leadership and language terms by design; they are not news.
  if (JOB_BOARD.test(sharedLink(p) ?? '') || HIRING.test(full)) return false
  // Untagged posts: skip text that is mostly a non-Latin script.
  if (!p.record.langs?.length && nonLatinShare(p.record.text) > 0.3) return false
  return true
}

export function keep(p: PostView, feed: BskyFeedDef): boolean {
  if (!presentable(p)) return false
  const text = postText(p)
  const hits = strongHits(feed, text)
  if (hits === 0) return false
  return !isOffTopic(text) || hits >= 2
}

/**
 * Bluesky posts matching a reader's search, as stories: every word of the query in the post (or
 * its link card), through the same spam and language checks as the feeds.
 */
export async function searchStories(q: string, days?: number, sort: 'top' | 'latest' = 'top'): Promise<Story[]> {
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1)
  const posts = await searchPosts(q, days ? days * 24 : undefined, sort)
  return posts.filter((p) => presentable(p) && words.every((w) => postText(p).toLowerCase().includes(w))).map(toStory)
}

export function whyKept(p: PostView): string[] {
  const text = postText(p)
  return BSKY_FEEDS.flatMap((f) => strongTerms(f, text).map((t) => `${f.rkey}:${t}`))
}

export function hotness(p: PostView, now = Date.now()): number {
  const engagement = (p.likeCount ?? 0) + 2 * (p.repostCount ?? 0) + 1.5 * (p.replyCount ?? 0) + (p.quoteCount ?? 0) + 1
  const ageH = Math.max(0, (now - postTime(p)) / 3_600_000)
  const shape = sharedLink(p) || postMedia(p) ? 1.25 : p.record.text.length < 80 ? 0.6 : 1
  return (engagement * shape) / Math.pow(ageH + 2, 1.4)
}

/** Ranked, deduplicated by link, and no account takes more than three of the top slots. */
export function rank(posts: PostView[], feed: BskyFeedDef, now = Date.now(), prefiltered = false): PostView[] {
  const seen = new Set<string>()
  const byLink = new Map<string, PostView>()
  const kept: PostView[] = []
  for (const p of posts) {
    if (seen.has(p.uri) || (!prefiltered && !keep(p, feed))) continue
    seen.add(p.uri)
    const link = sharedLink(p)
      ?.replace(/[?#].*$/, '')
      .replace(/\/$/, '')
    if (link) {
      const other = byLink.get(link)
      if (other && hotness(other, now) >= hotness(p, now)) continue
      if (other) kept.splice(kept.indexOf(other), 1)
      byLink.set(link, p)
    }
    kept.push(p)
  }
  kept.sort((a, b) => hotness(b, now) - hotness(a, now))
  const perAuthor = new Map<string, number>()
  return kept.filter((p) => {
    const n = (perAuthor.get(p.author.did) ?? 0) + 1
    perAuthor.set(p.author.did, n)
    return n <= 3
  })
}

/* ------------------------------------------------------------ build + cache */

const cache = new Map<string, { at: number; posts: PostView[] }>()
const TTL = 2 * 60_000

export async function buildFeed(rkey: string): Promise<PostView[]> {
  const feed = BSKY_FEED_BY_RKEY.get(rkey)
  if (!feed) throw new Error(`Unknown feed ${rkey}`)
  const hit = cache.get(rkey)
  if (hit && Date.now() - hit.at < TTL) return hit.posts
  let ranked: PostView[]
  if (!feed.terms.length) {
    // The broad feed is topic feeds merged, so it inherits their filtering, then holds posts to a
    // higher bar: a shared link, or strong terms from more than one place in the text.
    const from = feed.merge?.from ?? []
    const parts = await Promise.allSettled(from.map((id) => buildFeed(id)))
    const minHits = feed.merge?.minHits ?? 1
    const posts = parts.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).filter((p) => !!sharedLink(p) || whyKept(p).length >= minHits)
    if (!posts.length && parts.every((r) => r.status === 'rejected')) throw (parts[0] as PromiseRejectedResult).reason
    ranked = rank(posts, feed, Date.now(), true)
  } else {
    const results = await Promise.allSettled(searchQueries(feed).map((q) => searchPosts(q, 48)))
    const posts = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    if (!posts.length && results.every((r) => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason
    ranked = rank(posts, feed)
  }
  ranked = ranked.slice(0, 200)
  cache.set(rkey, { at: Date.now(), posts: ranked })
  return ranked
}

/* ------------------------------------------------------------- as stories */

export const bskyKey = (uri: string) => storyKey({ kind: 'bs', uri })

export function postUrl(p: Pick<PostView, 'uri' | 'author'>): string {
  return `https://bsky.app/profile/${p.author.handle}/post/${p.uri.split('/').pop()}`
}

export function toStory(p: PostView): Story {
  const ext = external(p)
  const text = postWords(p)
  const firstLine =
    text
      .split('\n')
      .find((l) => l.trim())
      ?.trim() ?? ''
  const title = ext?.title?.trim() || (firstLine.length > 140 ? firstLine.slice(0, 140).replace(/\s+\S*$/, '') + '…' : firstLine) || 'Post'
  const labels = [...(p.labels ?? []), ...(p.author.labels ?? [])].flatMap((l) => (l.src ? [{ src: l.src, val: l.val }] : []))
  return {
    key: bskyKey(p.uri),
    source: 'bluesky',
    sourceLabel: selfPostOf(p) ? 'PaperWing' : 'Bluesky',
    title,
    url: sharedLink(p) ?? null,
    discussionUrl: postUrl(p),
    author: p.author.handle,
    score: p.likeCount ?? 0,
    comments: p.replyCount ?? 0,
    createdAt: postTime(p),
    text: text
      ? text
          .split(/\n{2,}/)
          .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
          .join('')
      : undefined,
    hasThread: true,
    thumbnail: ext?.thumb,
    media: postMedia(p),
    quote: quotedPost(p),
    ref: { uri: p.uri, cid: p.cid },
    // Labels travel with the story; the reader's own labeler settings decide what they mean.
    ...(labels.length ? { labels } : {}),
    authorDid: p.author.did,
  }
}
