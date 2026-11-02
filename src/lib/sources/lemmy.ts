import { marked } from 'marked'
import type { Comment, Media, Story, Thread } from '../types'
import { LEMMY_DEFAULT, LEMMY_INSTANCES, lemmyKey } from '../lemmyKey'
import { useLemmyAccount } from '../lemmyAccount'
import { getJson } from './http'
import { webUrl } from '../webUrl'

// Lemmy, read through two instances: programming.dev, a tech-focused instance that federates the
// big tech communities, and lemmy.world, the biggest general one, for everything else. Their APIs
// are public and CORS-open, so everything is fetched straight from the browser.
export const LEMMY = `https://${LEMMY_DEFAULT}`
const base = (via = LEMMY_DEFAULT) => {
  // The two shared instances, or your own Lemmy server once you've signed in to it.
  if (!LEMMY_INSTANCES.has(via) && via !== useLemmyAccount.getState().instance) throw new Error(`PaperWing doesn't read Lemmy through ${via}`)
  return `https://${via}`
}

export type LemmySort = 'Hot' | 'Active' | 'New' | 'TopDay' | 'TopWeek'

interface Counts {
  score: number
  comments?: number
  child_count?: number
}
interface PostView {
  post: {
    id: number
    name: string
    url?: string
    body?: string
    thumbnail_url?: string
    url_content_type?: string
    embed_description?: string
    ap_id: string
    nsfw: boolean
    removed: boolean
    deleted: boolean
    published: string
  }
  creator: { name: string; actor_id: string }
  community: { name: string; actor_id: string }
  counts: Counts & { comments: number }
}
interface CommentView {
  comment: { id: number; content: string; path: string; published: string; ap_id: string; removed: boolean; deleted: boolean }
  creator: { name: string; actor_id: string }
  counts: Counts & { child_count: number }
}

const md = (text: string) => marked.parse(text, { async: false, gfm: true, breaks: true })
/** A post's own words: cross-posts open with a "cross-posted from: <link>" line that says nothing. */
const body = (text?: string) => text?.replace(/^\s*cross-posted from:.*$/gim, '').trim() || undefined
/** "name@instance" for anyone not on the instance reading them, the way Lemmy shows remote users. */
const handle = (u: { name: string; actor_id: string }, via = LEMMY_DEFAULT) => {
  const host = new URL(u.actor_id).hostname
  return host === via ? u.name : `${u.name}@${host}`
}
const IMAGE = /\.(jpe?g|png|gif|webp|avif)(\?|$)/i
const isImage = (p: PostView['post']) => !!p.url && (p.url_content_type?.startsWith('image/') || IMAGE.test(p.url))

export function lemmyStory(v: PostView, via = LEMMY_DEFAULT): Story {
  const p = v.post
  const own = body(p.body)
  const image = isImage(p)
  const media: Media[] | undefined = image ? [{ kind: 'image', thumb: p.thumbnail_url || p.url!, full: p.url }] : undefined
  return {
    key: lemmyKey(p.id, via),
    source: 'lemmy',
    sourceLabel: `c/${v.community.name}`,
    title: p.name.trim(),
    // An image post is the conversation itself, not a link out.
    url: image ? null : (webUrl(p.url) ?? null),
    discussionUrl: p.ap_id,
    author: handle(v.creator, via),
    score: v.counts.score,
    comments: v.counts.comments,
    createdAt: Date.parse(p.published),
    text: own ? md(own) : undefined,
    tags: [v.community.name.toLowerCase()],
    thumbnail: image ? undefined : p.thumbnail_url,
    hasThread: true,
    media,
  }
}

const usable = (v: PostView) => !v.post.nsfw && !v.post.removed && !v.post.deleted

export async function lemmyFeed(community: string | undefined, sort: LemmySort = 'Hot', via = LEMMY_DEFAULT): Promise<Story[]> {
  const qs = new URLSearchParams({ sort, limit: '40', type_: 'All' })
  if (community) qs.set('community_name', community)
  const { posts } = await getJson<{ posts: PostView[] }>(`${base(via)}/api/v3/post/list?${qs}`)
  return posts.filter(usable).map((v) => lemmyStory(v, via))
}

/** Builds the reply tree from Lemmy's flat list, where each comment's path is "0.<ancestor ids>.<id>". */
export function lemmyComments(views: CommentView[], via = LEMMY_DEFAULT): Comment[] {
  const byId = new Map<string, Comment>()
  const replies = new Map<string, number>()
  for (const v of views) {
    const c = v.comment
    const gone = c.removed || c.deleted
    const id = String(c.id)
    byId.set(id, {
      id,
      author: handle(v.creator, via),
      html: gone ? '' : md(c.content),
      deleted: gone || undefined,
      createdAt: Date.parse(c.published),
      score: v.counts.score,
      url: c.ap_id,
      children: [],
    })
    replies.set(id, v.counts.child_count)
  }
  const roots: Comment[] = []
  for (const v of views) {
    const ids = v.comment.path.split('.')
    const node = byId.get(ids[ids.length - 1])!
    // A reply whose parent fell outside what Lemmy returned has nowhere to go.
    if (ids.length <= 2) roots.push(node)
    else byId.get(ids[ids.length - 2])?.children.push(node)
  }
  // Lemmy stops at 300 comments; what it left out shows as "more replies on Lemmy".
  for (const [id, c] of byId) {
    const loaded = c.children.reduce((n, k) => n + 1 + (replies.get(k.id) ?? 0), 0)
    const total = replies.get(id) ?? 0
    if (total > loaded) c.more = total - loaded
  }
  return roots
}

export async function lemmyThread(id: string, via = LEMMY_DEFAULT): Promise<Thread> {
  const api = base(via)
  const [{ post_view }, { comments }] = await Promise.all([
    getJson<{ post_view: PostView }>(`${api}/api/v3/post?id=${id}`),
    getJson<{ comments: CommentView[] }>(`${api}/api/v3/comment/list?post_id=${id}&max_depth=8&sort=Top&type_=All`),
  ])
  return { story: lemmyStory(post_view, via), comments: lemmyComments(comments, via) }
}

/**
 * Lemmy posts matching a search, across every community programming.dev knows about. Lemmy also
 * matches post bodies, which turns up loosely related threads, so every word has to be in the title.
 */
export async function lemmySearch(q: string, days?: number, sort: 'top' | 'new' = 'top'): Promise<Story[]> {
  const top = !days ? 'TopAll' : days <= 1 ? 'TopDay' : days <= 7 ? 'TopWeek' : days <= 31 ? 'TopMonth' : 'TopYear'
  const qs = new URLSearchParams({ q, type_: 'Posts', listing_type: 'All', sort: sort === 'new' ? 'New' : top, limit: '50' })
  const { posts } = await getJson<{ posts: PostView[] }>(`${LEMMY}/api/v3/search?${qs}`)
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1)
  return posts.filter((v) => usable(v) && words.every((w) => v.post.name.toLowerCase().includes(w))).map((v) => lemmyStory(v))
}

/** Lemmy posts sharing a link, across every community either instance knows about, each post once. */
export async function lemmyByUrl(url: string): Promise<Story[]> {
  const qs = new URLSearchParams({ q: url, type_: 'Url', listing_type: 'All', limit: '10' })
  const found = await Promise.allSettled([...LEMMY_INSTANCES].map(async (via) => ({ via, posts: (await getJson<{ posts: PostView[] }>(`${base(via)}/api/v3/search?${qs}`)).posts })))
  if (found.every((f) => f.status === 'rejected')) throw (found[0] as PromiseRejectedResult).reason
  const seen = new Set<string>()
  return found.flatMap((f) =>
    f.status === 'fulfilled' ? f.value.posts.filter((v) => usable(v) && v.counts.comments > 0 && !seen.has(v.post.ap_id) && !!seen.add(v.post.ap_id)).map((v) => lemmyStory(v, f.value.via)) : [],
  )
}
