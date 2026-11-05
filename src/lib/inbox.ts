import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAccounts } from './accounts'
import { appview, canReadNotifications, useAtproto } from './atproto'
import { bskyKeyOf } from './bskyPost'
import { lemmyInbox } from './lemmyAccount'
import { feed, getJson } from './sources/http'
import { auth, cleanHtml, keyFor, type Status } from './sources/mastodon'
import type { Story } from './types'

// Activity: everything that's happened to you across the networks you've signed in to, and
// everything you've written there, in one place. Each network is read its own way:
//   Bluesky:   your notifications (a sign-in permission), your posts and replies (public).
//   Hacker News: no notifications exist, so replies are found the way HN-reply services do,
//              from the replies (kids) under your recent comments and stories.
//   Frontpage: no notifications either: replies to your posts and comments, found through
//              Constellation by PaperWing's server (/api/feed?src=fpactivity).
//   Mastodon:  your notifications and your posts, from your server.
//   Lemmy:     replies and mentions, and your posts and comments, from your server.
// What's new is tracked here, on this device: nothing is marked read on the networks themselves.

export type Network = 'bluesky' | 'hn' | 'frontpage' | 'mastodon' | 'lemmy'
export type NoticeKind = 'reply' | 'mention' | 'quote' | 'like' | 'repost' | 'follow' | 'vote'

export interface Notice {
  id: string
  network: Network
  kind: NoticeKind
  /** Who did it: one, or several when likes on the same post are grouped. */
  actors: string[]
  at: number
  /** Their words, for replies, mentions and quotes. */
  text?: string
  /** What of yours it's about: a post's title or first words. */
  subject?: string
  /** A reply straight to a post of yours (a comment on it), not to a comment. */
  onPost?: boolean
  /** The thread to open in the reader. */
  open?: string
  /** Where it lives on the network, when it can't open here. */
  url?: string
}

export interface Mine {
  id: string
  network: Network
  kind: 'post' | 'comment'
  at: number
  text: string
  /** For a comment: what it's on. */
  on?: string
  score?: number
  replies?: number
  open?: string
  url?: string
}

export interface Activity {
  notices: Notice[]
  mine: Mine[]
}

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
const clip = (s: string, n = 180) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s)

/* --------------------------------------------------------------- Bluesky */

interface BskyPost {
  uri: string
  author: { did: string; handle: string }
  record: { text: string; createdAt: string; reply?: { parent: { uri: string }; root: { uri: string } } }
  likeCount?: number
  replyCount?: number
  indexedAt: string
}
interface BskyNotice {
  uri: string
  author: { handle: string }
  reason: string
  reasonSubject?: string
  record: { text?: string; reply?: { parent: { uri: string }; root: { uri: string } } }
  indexedAt: string
}

const PUBLIC = 'https://public.api.bsky.app/xrpc'
const bskyUrl = (uri: string, handle: string) => `https://bsky.app/profile/${handle}/post/${uri.split('/').pop()}`

async function bskyPosts(uris: string[]): Promise<Map<string, BskyPost>> {
  const out = new Map<string, BskyPost>()
  const unique = [...new Set(uris)]
  for (let i = 0; i < unique.length; i += 25) {
    const qs = unique
      .slice(i, i + 25)
      .map((u) => `uris=${encodeURIComponent(u)}`)
      .join('&')
    const { posts } = await getJson<{ posts: BskyPost[] }>(`${PUBLIC}/app.bsky.feed.getPosts?${qs}`).catch(() => ({ posts: [] as BskyPost[] }))
    for (const p of posts) out.set(p.uri, p)
  }
  return out
}

export async function blueskyActivity(did: string, handle: string, notifications: boolean): Promise<Activity> {
  const [feed, list] = await Promise.all([
    getJson<{ feed: { post: BskyPost; reason?: unknown }[] }>(`${PUBLIC}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&filter=posts_with_replies&limit=50`),
    notifications ? appview<{ notifications: BskyNotice[] }>('app.bsky.notification.listNotifications', { limit: 60 }) : Promise.resolve({ notifications: [] as BskyNotice[] }),
  ])
  const own = feed.feed.filter((f) => !f.reason && f.post.author.did === did).map((f) => f.post)
  // What your replies were to, and what likes and reposts were of: one batch from the public API.
  const subjects = await bskyPosts([
    ...own.flatMap((p) => (p.record.reply ? [p.record.reply.parent.uri] : [])),
    ...list.notifications.flatMap((n) => (n.reasonSubject ? [n.reasonSubject] : n.record.reply ? [n.record.reply.parent.uri] : [])),
  ])
  const mine: Mine[] = own.map((p) => {
    const parent = p.record.reply ? subjects.get(p.record.reply.parent.uri) : undefined
    return {
      id: `bs:${p.uri}`,
      network: 'bluesky',
      kind: p.record.reply ? 'comment' : 'post',
      at: Date.parse(p.record.createdAt) || Date.parse(p.indexedAt),
      text: clip(p.record.text || '(a picture or link)', 280),
      on: p.record.reply ? (parent ? `@${parent.author.handle}: ${clip(parent.record.text, 80)}` : 'a post') : undefined,
      score: p.likeCount,
      replies: p.replyCount,
      open: bskyKeyOf(p.record.reply?.root.uri ?? p.uri),
      url: bskyUrl(p.uri, handle),
    }
  })
  const notices: Notice[] = list.notifications.flatMap((n): Notice[] => {
    const kinds: Record<string, NoticeKind> = { reply: 'reply', mention: 'mention', quote: 'quote', like: 'like', repost: 'repost', follow: 'follow' }
    const kind: NoticeKind | undefined = kinds[n.reason]
    if (!kind) return []
    const subjectUri = n.reasonSubject ?? n.record.reply?.parent.uri
    const subject = subjectUri ? subjects.get(subjectUri) : undefined
    // Open the conversation it happened in: your post for likes and reposts, the thread for replies.
    const openUri = kind === 'like' || kind === 'repost' ? subjectUri : kind === 'follow' ? undefined : (n.record.reply?.root.uri ?? n.uri)
    return [
      {
        id: `bs:${n.uri}`,
        network: 'bluesky',
        kind,
        actors: [n.author.handle],
        at: Date.parse(n.indexedAt),
        text: n.record.text && (kind === 'reply' || kind === 'mention' || kind === 'quote') ? clip(n.record.text, 280) : undefined,
        subject: subject ? clip(subject.record.text || '(a picture or link)', 120) : undefined,
        open: openUri ? bskyKeyOf(openUri) : undefined,
        url: kind === 'follow' ? `https://bsky.app/profile/${n.author.handle}` : bskyUrl(n.uri, n.author.handle),
      },
    ]
  })
  return { notices, mine }
}

/* ----------------------------------------------------------- Hacker News */

interface AlgoliaHit {
  objectID: string
  _tags: string[]
  title?: string | null
  comment_text?: string | null
  story_title?: string | null
  story_id?: number | null
  points?: number | null
  num_comments?: number | null
  created_at_i: number
}
interface HnItem {
  id: number
  by?: string
  text?: string
  time: number
  kids?: number[]
  deleted?: boolean
  dead?: boolean
}

const FIREBASE = 'https://hacker-news.firebaseio.com/v0'
const DAY = 86_400_000

export async function hnActivity(user: string): Promise<Activity> {
  const { hits } = await getJson<{ hits: AlgoliaHit[] }>(`https://hn.algolia.com/api/v1/search_by_date?tags=author_${encodeURIComponent(user)}&hitsPerPage=50&attributesToHighlight=%5B%5D`)
  const items = hits.filter((h) => h._tags.includes('story') || h._tags.includes('comment'))
  const mine: Mine[] = items.map((h) => {
    const story = h._tags.includes('story')
    const storyId = story ? h.objectID : String(h.story_id ?? h.objectID)
    return {
      id: `hn:${h.objectID}`,
      network: 'hn',
      kind: story ? 'post' : 'comment',
      at: h.created_at_i * 1000,
      text: story ? (h.title ?? '') : clip(plain(h.comment_text ?? ''), 280),
      on: story ? undefined : (h.story_title ?? undefined),
      score: story ? (h.points ?? undefined) : undefined,
      replies: story ? (h.num_comments ?? undefined) : undefined,
      open: `hn-${storyId}`,
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    }
  })
  // Replies: the children of what you wrote in the last fortnight, a couple of dozen items at most.
  const recent = items.filter((h) => Date.now() - h.created_at_i * 1000 < 14 * DAY).slice(0, 25)
  const parents = await Promise.all(recent.map((h) => getJson<HnItem | null>(`${FIREBASE}/item/${h.objectID}.json`).catch(() => null)))
  const kids = recent.flatMap((h, i) => (parents[i]?.kids ?? []).slice(0, 10).map((k) => ({ k, h })))
  const replies = await Promise.all(kids.slice(0, 80).map(({ k }) => getJson<HnItem | null>(`${FIREBASE}/item/${k}.json`).catch(() => null)))
  const notices: Notice[] = kids.slice(0, 80).flatMap(({ h }, i): Notice[] => {
    const r = replies[i]
    if (!r || r.deleted || r.dead || !r.by || r.by === user) return []
    const story = h._tags.includes('story')
    return [
      {
        id: `hn:${r.id}`,
        network: 'hn',
        kind: 'reply',
        actors: [r.by],
        at: r.time * 1000,
        text: clip(plain(r.text ?? ''), 280),
        subject: story ? (h.title ?? undefined) : clip(plain(h.comment_text ?? ''), 120),
        onPost: story,
        open: `hn-${story ? h.objectID : (h.story_id ?? h.objectID)}`,
        url: `https://news.ycombinator.com/item?id=${r.id}`,
      },
    ]
  })
  return { notices, mine }
}

/* ------------------------------------------------------------- Frontpage */

interface FpActivity {
  posts: Story[]
  comments: { uri: string; text: string; createdAt: number; postKey: string; votes: number }[]
  replies: { uri: string; author: string; text: string; createdAt: number; postKey: string; to: 'post' | 'comment'; subject: string }[]
}

export async function frontpageActivity(did: string): Promise<Activity> {
  const a = (await feed('fpactivity', { did })) as FpActivity
  const titleOf = new Map(a.posts.map((p) => [p.key, p.title]))
  return {
    mine: [
      ...a.posts.map(
        (p): Mine => ({ id: `fp:${p.key}`, network: 'frontpage', kind: 'post', at: p.createdAt, text: p.title, score: p.score, replies: p.comments, open: p.key, url: p.discussionUrl ?? undefined }),
      ),
      ...a.comments.map(
        (c): Mine => ({ id: `fp:${c.uri}`, network: 'frontpage', kind: 'comment', at: c.createdAt, text: clip(c.text, 280), on: titleOf.get(c.postKey), score: c.votes, open: c.postKey }),
      ),
    ],
    notices: a.replies.map((r) => ({
      id: `fp:${r.uri}`,
      network: 'frontpage',
      kind: 'reply',
      actors: [r.author],
      at: r.createdAt,
      text: clip(r.text, 280),
      subject: clip(r.subject, 120),
      open: r.postKey,
    })),
  }
}

/* -------------------------------------------------------------- Mastodon */

interface MdNotification {
  id: string
  type: string
  created_at: string
  account: { acct: string }
  status?: Status | null
}

export async function mastodonActivity(instance: string): Promise<Activity> {
  const headers = auth(instance)
  if (!headers) return { notices: [], mine: [] }
  const get = <T>(path: string) => getJson<T>(`https://${instance}${path}`, { headers })
  const me = await get<{ id: string }>('/api/v1/accounts/verify_credentials')
  const [list, statuses] = await Promise.all([get<MdNotification[]>('/api/v1/notifications?limit=40'), get<Status[]>(`/api/v1/accounts/${me.id}/statuses?limit=40&exclude_reblogs=true`)])
  const kinds: Record<string, NoticeKind> = { mention: 'mention', favourite: 'like', reblog: 'repost', follow: 'follow', quote: 'quote' }
  const notices: Notice[] = list.flatMap((n): Notice[] => {
    let kind = kinds[n.type]
    if (!kind) return []
    const s = n.status
    // A mention that answers one of your posts is a reply.
    if (kind === 'mention' && s?.in_reply_to_id) kind = 'reply'
    const words = s ? plain(cleanHtml(s.content)) : ''
    return [
      {
        id: `md:${n.id}`,
        network: 'mastodon',
        kind,
        actors: [n.account.acct],
        at: Date.parse(n.created_at),
        text: kind === 'mention' || kind === 'reply' || kind === 'quote' ? clip(words, 280) : undefined,
        subject: kind === 'like' || kind === 'repost' ? clip(words, 120) : undefined,
        open: s ? keyFor(instance, kind === 'reply' && s.in_reply_to_id ? s.in_reply_to_id : s.id) : undefined,
        url: s?.url ?? `https://${instance}/@${n.account.acct}`,
      },
    ]
  })
  const mine: Mine[] = statuses.map((s) => ({
    id: `md:${s.id}`,
    network: 'mastodon',
    kind: s.in_reply_to_id ? 'comment' : 'post',
    at: Date.parse(s.created_at),
    text: clip(plain(cleanHtml(s.spoiler_text || s.content)) || '(a picture or link)', 280),
    score: s.favourites_count + s.reblogs_count,
    replies: s.replies_count,
    open: keyFor(instance, s.id),
    url: s.url ?? undefined,
  }))
  return { notices, mine }
}

/* ----------------------------------------------------------------- Lemmy */

export async function lemmyActivity(): Promise<Activity> {
  const { notices, mine } = await lemmyInbox()
  return {
    notices: notices.map((n) => ({
      id: n.id,
      network: 'lemmy',
      kind: n.kind,
      actors: [n.author],
      at: n.at,
      text: clip(plain(n.text), 280),
      subject: n.postTitle,
      onPost: n.onPost,
      open: n.postKey,
      url: n.apId,
    })),
    mine: mine.map((m) => ({
      id: `lm:${m.apId}`,
      network: 'lemmy',
      kind: m.kind,
      at: m.at,
      text: clip(plain(m.text), 280),
      on: m.on,
      score: m.score,
      replies: m.replies,
      open: m.postKey,
      url: m.apId,
    })),
  }
}

/* ---------------------------------------------------------------- merged */

/** Likes, reposts and votes on the same thing within a day read as one line: "A, B and 3 others liked…". */
export function groupNotices(notices: Notice[]): Notice[] {
  const sorted = [...notices].sort((a, b) => b.at - a.at)
  const out: Notice[] = []
  const groups = new Map<string, Notice>()
  for (const n of sorted) {
    if (n.kind !== 'like' && n.kind !== 'repost' && n.kind !== 'vote') {
      out.push(n)
      continue
    }
    const key = `${n.network}:${n.kind}:${n.open ?? n.subject}`
    const g = groups.get(key)
    if (g && g.at - n.at < DAY) {
      if (!g.actors.includes(n.actors[0])) g.actors.push(...n.actors)
      continue
    }
    const copy = { ...n, actors: [...n.actors] }
    groups.set(key, copy)
    out.push(copy)
  }
  return out
}

interface InboxState {
  /** When you last looked at Activity: newer notices are new. */
  seenAt: number
  markSeen: () => void
}

export const useInboxSeen = create<InboxState>()(persist((set) => ({ seenAt: 0, markSeen: () => set({ seenAt: Date.now() }) }), { name: 'readout:inbox', version: 1 }))

const FIVE_MINUTES = 5 * 60_000

/** Everyone you're signed in to, read and merged: polled every five minutes while the app is open. */
export function useActivityFeed() {
  // Each a plain value: a selector that builds a new object every time re-renders forever.
  // Where you're signed in, as the accounts module sees it; plus whether Bluesky may read your notifications.
  const accounts = useAccounts()
  const bskyNotices = useAtproto((a) => canReadNotifications(a.scope) !== false)
  const bskyDid = accounts.bluesky?.did
  const bskyHandle = accounts.bluesky?.handle ?? bskyDid
  const hnUser = accounts.hn?.user
  const mdInstance = accounts.mastodon?.instance
  const mdAcct = accounts.mastodon?.acct
  const lmUser = accounts.lemmy?.user
  const lmInstance = accounts.lemmy?.instance
  const sources = useMemo(() => {
    const list: { network: Network; key: unknown[]; run: () => Promise<Activity> }[] = []
    if (bskyDid) {
      list.push({ network: 'bluesky', key: ['activity', 'bluesky', bskyDid, bskyNotices], run: () => blueskyActivity(bskyDid, bskyHandle!, !!bskyNotices) })
      list.push({ network: 'frontpage', key: ['activity', 'frontpage', bskyDid], run: () => frontpageActivity(bskyDid) })
    }
    if (hnUser) list.push({ network: 'hn', key: ['activity', 'hn', hnUser], run: () => hnActivity(hnUser) })
    if (mdInstance && mdAcct) list.push({ network: 'mastodon', key: ['activity', 'mastodon', mdAcct], run: () => mastodonActivity(mdInstance) })
    if (lmUser && lmInstance) list.push({ network: 'lemmy', key: ['activity', 'lemmy', lmUser, lmInstance], run: lemmyActivity })
    return list
  }, [bskyDid, bskyHandle, bskyNotices, hnUser, mdInstance, mdAcct, lmUser, lmInstance])
  const results = useQueries({
    queries: sources.map((s) => ({ queryKey: s.key, queryFn: s.run, staleTime: FIVE_MINUTES, refetchInterval: FIVE_MINUTES, refetchIntervalInBackground: false, retry: 1 })),
  })
  const stamp = results.map((r) => r.dataUpdatedAt).join(',')
  const merged = useMemo(() => {
    const notices = groupNotices(results.flatMap((r) => r.data?.notices ?? []))
    const mine = results.flatMap((r) => r.data?.mine ?? []).sort((a, b) => b.at - a.at)
    return { notices, mine }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp])
  const statuses = sources.map((s, i) => ({ network: s.network, pending: results[i]?.isPending ?? true, error: results[i]?.error as Error | null }))
  return { ...merged, statuses, connected: sources.map((s) => s.network), refetch: () => results.forEach((r) => void r.refetch()) }
}

/** New notices since you last looked: for the dot on the nav. */
export function useUnread(): number {
  const { notices } = useActivityFeed()
  const seenAt = useInboxSeen((s) => s.seenAt)
  return notices.filter((n) => n.at > seenAt).length
}
