import { parseStoryKey } from '../storyKey'
import type { Comment, Story, Thread } from '../types'
import { markup } from '../markup'
import { api, getJson } from './http'
import { acceptLabelers } from '../moderation'
import { usePrefs } from '../store'
import { bskyKeyOf, postHtml, postMedia, postWords, quotedPost, selfPostOf, sharedLink, type Shareable } from '../bskyPost'
import { fetchSelfPost, withSelfPost } from '../selfPost'

// Feeds come from our own generator (api/atproto.ts); threads straight from Bluesky's public,
// CORS-open AppView, so opening a post costs no function call.
const APPVIEW = 'https://public.api.bsky.app/xrpc'

let status: Promise<boolean> | undefined
export function blueskyEnabled(): Promise<boolean> {
  status ??= getJson<{ enabled: boolean }>('/api/atproto?route=status')
    .then((r) => r.enabled)
    .catch(() => false)
  return status
}

export async function blueskyFeed(feed: string): Promise<Story[]> {
  return (await api('atproto', { route: 'stories', feed })) as Story[]
}

const uriFromKey = (key: string) => {
  const p = parseStoryKey(key)
  return p?.kind === 'bs' ? p.uri : ''
}

interface PostView {
  uri: string
  cid: string
  author: { did?: string; handle: string; displayName?: string; avatar?: string; labels?: { src: string; val: string }[] }
  labels?: { src: string; val: string }[]
  record: Shareable['record'] & { createdAt: string; reply?: unknown }
  embed?: Shareable['embed']
  likeCount?: number
  replyCount?: number
  indexedAt: string
}
interface ThreadNode {
  $type: string
  post?: PostView
  replies?: ThreadNode[]
}

/** Post text as HTML, with the markdown people type into it (quotes, lists, code) shown as such. */
const textHtml = (text: string) => markup(postHtml(text))
/** A post's labels and its author's: both count (an account labelled spam is spam everywhere). */
const labelsOf = (p: PostView) => {
  const all = [...(p.labels ?? []), ...(p.author.labels ?? [])].map(({ src, val }) => ({ src, val }))
  return all.length ? all : undefined
}
/** Reads from Bluesky's public AppView, asking for your labelers' labels too. */
const bsky = <T>(url: string) => getJson<T>(url, { headers: { 'atproto-accept-labelers': acceptLabelers(usePrefs.getState().labelers) } })
const time = (p: PostView) => Math.min(Date.parse(p.record.createdAt) || Infinity, Date.parse(p.indexedAt) || Infinity)
const postUrl = (p: PostView) => `https://bsky.app/profile/${p.author.handle}/post/${p.uri.split('/').pop()}`

function mapReplies(nodes: ThreadNode[] = []): Comment[] {
  return nodes
    .filter((n) => n.$type === 'app.bsky.feed.defs#threadViewPost' && n.post)
    .sort((a, b) => (b.post!.likeCount ?? 0) - (a.post!.likeCount ?? 0))
    .map((n) => ({
      id: n.post!.uri,
      author: n.post!.author.handle,
      authorDid: n.post!.author.did,
      labels: labelsOf(n.post!),
      html: textHtml(n.post!.record.text),
      createdAt: time(n.post!),
      score: n.post!.likeCount ?? 0,
      url: postUrl(n.post!),
      media: postMedia(n.post!),
      quote: quotedPost(n.post!),
      ref: { uri: n.post!.uri, cid: n.post!.cid },
      children: mapReplies(n.replies),
    }))
}

/** A Bluesky post as a story: its link card's title, or its first line. */
export function postStory(p: PostView, key = bskyKeyOf(p.uri)): Story {
  const ext = p.embed?.external ?? p.embed?.media?.external
  const text = postWords(p)
  const first =
    text
      .split('\n')
      .find((l) => l.trim())
      ?.trim() ?? 'Post'
  return {
    key,
    source: 'bluesky',
    // A PaperWing post lives on Bluesky, but it's shown as PaperWing's own wherever it's read.
    sourceLabel: selfPostOf(p) ? 'PaperWing' : 'Bluesky',
    title: ext?.title?.trim() || (first.length > 140 ? first.slice(0, 140).replace(/\s+\S*$/, '') + '…' : first),
    url: sharedLink(p) ?? null,
    discussionUrl: postUrl(p),
    author: p.author.handle,
    score: p.likeCount ?? 0,
    comments: p.replyCount ?? 0,
    createdAt: time(p),
    text: text ? textHtml(text) : undefined,
    hasThread: true,
    media: postMedia(p),
    quote: quotedPost(p),
    ref: { uri: p.uri, cid: p.cid },
    labels: labelsOf(p),
    authorDid: p.author.did,
  }
}

export async function blueskyThread(key: string): Promise<Thread> {
  const uri = uriFromKey(key)
  const { thread } = await bsky<{ thread: ThreadNode }>(`${APPVIEW}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=10&parentHeight=0`)
  if (!thread.post) throw new Error('This post is unavailable')
  const story = postStory(thread.post, key)
  // A PaperWing self post: its words are on PaperWing, not in the post. Without them, the post's own snippet stands.
  const self = selfPostOf(thread.post) ? await fetchSelfPost(key).catch(() => undefined) : undefined
  return { story: self ? withSelfPost(story, self) : story, comments: mapReplies(thread.replies) }
}

/** One link as written by different posts: no scheme, www, query, fragment or trailing slash. */
export const linkId = (link: string) =>
  link
    .replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '')
    .toLowerCase()

type Who = { did?: string; handle: string; displayName?: string; avatar?: string }
export type TimelineItem = { post: PostView; reason?: { $type: string; by?: Who }; reply?: { root?: PostView; parent?: PostView } }

// Your timeline, read once for both the Following channel and the "people you follow shared this"
// notes on every other feed: a couple of minutes is fresh enough for either.
let timelineCache: { did: string; at: number; items: Promise<TimelineItem[]> } | undefined

/** The last few hundred posts in your Bluesky timeline (signed in, with the timeline permission). */
export async function timeline(): Promise<TimelineItem[]> {
  const { appview, useAtproto } = await import('../atproto')
  const did = useAtproto.getState().did ?? ''
  if (timelineCache && timelineCache.did === did && Date.now() - timelineCache.at < 120_000) return timelineCache.items
  const items = (async () => {
    const out: TimelineItem[] = []
    let cursor: string | undefined
    for (let page = 0; page < 3; page++) {
      const res = await appview<{ feed: TimelineItem[]; cursor?: string }>('app.bsky.feed.getTimeline', { limit: 100, cursor })
      out.push(...res.feed)
      cursor = res.cursor
      if (!cursor) break
    }
    return out
  })()
  timelineCache = { did, at: Date.now(), items }
  items.catch(() => (timelineCache = undefined))
  return items
}

/**
 * Links from the people you follow on Bluesky: your timeline (signed in), kept to posts and
 * reposts that share a link, one story per link with everyone who shared it.
 */
export async function blueskyFollowing(): Promise<Story[]> {
  const items = await timeline()
  const byLink = new Map<string, { story: Story; people: string[]; likes: number }>()
  for (const { post, reason } of items) {
    const link = sharedLink(post)
    if (!link || post.record.reply) continue
    const who = reason?.$type === 'app.bsky.feed.defs#reasonRepost' && reason.by ? reason.by.handle : post.author.handle
    const id = linkId(link)
    const seen = byLink.get(id)
    if (seen) {
      if (!seen.people.includes(who)) seen.people.push(who)
      // The busiest post about it leads.
      if ((post.likeCount ?? 0) > seen.likes) byLink.set(id, { story: postStory(post), people: seen.people, likes: post.likeCount ?? 0 })
    } else byLink.set(id, { story: postStory(post), people: [who], likes: post.likeCount ?? 0 })
  }
  return [...byLink.values()].map(({ story, people }) => ({ ...story, followed: true, sharedBy: people, weight: 40 + people.length * 25 }))
}

export interface Friend {
  handle: string
  name?: string
  avatar?: string
  /**
   * How they took part: quoted a post sharing the link with words of their own, posted it, replied
   * in a conversation about it, or reposted someone else's post of it. ('shared' is how a cache
   * from before these were told apart says posted or reposted.)
   */
  how: 'quoted' | 'posted' | 'replied' | 'reposted' | 'shared'
  /** Their own post about it, as a story key: what to open, like or reply to. Never for a repost, which isn't theirs. */
  post?: string
  /** Their words in it, short. */
  text?: string
  likes?: number
  replies?: number
  /** When they posted it (ms). */
  at?: number
}

/** Most worth your attention first: someone's own words about it, then their post, a reply, a repost. */
export const TOOK_PART: Record<Friend['how'], number> = { quoted: 0, posted: 1, shared: 1, replied: 2, reposted: 3 }

/** The link a post shares, or the link of the post it quotes. */
const linkOf = (p: PostView) => sharedLink(p) ?? quotedPost(p)?.link?.url

/**
 * Who you follow has taken part in each link's conversation lately, by linkId: posting it, quoting a
 * post of it, replying under one, or reposting one. Each person once, as the way they took part
 * that says most, and their own post kept so it can be opened and answered.
 */
export async function friendsByLink(): Promise<Record<string, Friend[]>> {
  const items = await timeline()
  const out = new Map<string, Friend[]>()
  const add = (link: string | undefined, who: Who, how: Friend['how'], post?: PostView) => {
    if (!link) return
    const id = linkId(link)
    const list = out.get(id) ?? []
    const at = list.findIndex((f) => f.handle === who.handle)
    if (at >= 0 && TOOK_PART[list[at].how] <= TOOK_PART[how]) return
    const created = post ? Date.parse(post.record.createdAt) : NaN
    const friend: Friend = {
      handle: who.handle,
      ...(who.displayName?.trim() ? { name: who.displayName.trim() } : {}),
      ...(who.avatar ? { avatar: who.avatar } : {}),
      how,
      ...(post
        ? {
            post: bskyKeyOf(post.uri),
            text: postWords(post).slice(0, 280),
            likes: post.likeCount ?? 0,
            replies: post.replyCount ?? 0,
            ...(Number.isFinite(created) ? { at: created } : {}),
          }
        : {}),
    }
    if (at >= 0) list[at] = friend
    else list.push(friend)
    out.set(id, list)
  }
  for (const { post, reason, reply } of items) {
    const reposter = reason?.$type === 'app.bsky.feed.defs#reasonRepost' ? reason.by : undefined
    if (post.record.reply) {
      // A reply in your timeline is by someone you follow: they're in the conversation about the thread's link.
      if (!reposter) add(reply?.root ? linkOf(reply.root) : undefined, post.author, 'replied', post)
      continue
    }
    const own = sharedLink(post)
    if (reposter) add(own ?? linkOf(post), reposter, 'reposted')
    else if (own) add(own, post.author, 'posted', post)
    else add(quotedPost(post)?.link?.url, post.author, 'quoted', post)
  }
  for (const list of out.values()) list.sort((a, b) => TOOK_PART[a.how] - TOOK_PART[b.how])
  // A plain object, so the query cache can keep it across launches.
  return Object.fromEntries(out)
}

/** A custom feed or a list, read through Bluesky's public API: no account needed. Replies are left out. */
export async function blueskyCustomFeed(uri: string): Promise<Story[]> {
  const list = uri.includes('/app.bsky.graph.list/')
  const url = list ? `${APPVIEW}/app.bsky.feed.getListFeed?list=${encodeURIComponent(uri)}&limit=60` : `${APPVIEW}/app.bsky.feed.getFeed?feed=${encodeURIComponent(uri)}&limit=60`
  const { feed } = await bsky<{ feed: { post: PostView }[] }>(url)
  const seen = new Set<string>()
  return feed.flatMap(({ post }) => (post.record.reply || seen.has(post.uri) || !seen.add(post.uri) ? [] : [postStory(post)]))
}

/** A bsky.app link to a feed or a list, as its at:// URI and display name. */
export async function resolveBlueskyFeed(link: string): Promise<{ uri: string; name: string }> {
  const m = link.trim().match(/bsky\.app\/profile\/([^/\s]+)\/(feed|lists)\/([a-z0-9]+)/i)
  if (!m) throw new Error('Paste a bsky.app link to a feed or a list')
  let did = decodeURIComponent(m[1])
  if (!did.startsWith('did:')) did = (await getJson<{ did: string }>(`/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(did)}`)).did
  if (m[2] === 'feed') {
    const uri = `at://${did}/app.bsky.feed.generator/${m[3]}`
    const { view } = await getJson<{ view: { displayName: string } }>(`${APPVIEW}/app.bsky.feed.getFeedGenerator?feed=${encodeURIComponent(uri)}`)
    return { uri, name: view.displayName }
  }
  const uri = `at://${did}/app.bsky.graph.list/${m[3]}`
  const { list } = await getJson<{ list: { name: string } }>(`${APPVIEW}/app.bsky.graph.getList?list=${encodeURIComponent(uri)}&limit=1`)
  return { uri, name: list.name }
}
