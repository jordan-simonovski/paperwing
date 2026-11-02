import { parseStoryKey, storyKey } from '../../src/lib/storyKey.js'
import type { Comment, Story, Thread } from '../../src/lib/types.js'
import { fetchJson, stripHtml } from './http.js'

// Frontpage (frontpage.fyi): a link aggregator on atproto, like Hacker News, where posts, comments
// and votes are records in each member's own repo. Frontpage publishes its ranked feeds as
// skeletons (lists of post URIs); each post is read from its author's server, and votes and
// comments are counted and listed through Constellation, a public index of links between records
// (constellation.microcosm.blue). Both of Frontpage's record namespaces are read: the current
// fyi.frontpage.feed.* and the older fyi.unravel.frontpage.*.
//
// Servers named in DID documents are chosen by their owners, so every fetch here goes through
// safeFetch (fetchJson), which refuses private addresses. Handles come from Bluesky's public API,
// which only returns ones that check out both ways.

const FEED_DID = 'did:plc:klmr76mpewpv7rtm3xgpzd7x'
const CONSTELLATION = 'https://constellation.microcosm.blue'
export type FrontpageFeed = 'hot' | 'new' | 'top'

const AT_URI = /^at:\/\/(did:(?:plc:[a-z2-7]{24}|web:[a-z0-9.%:-]+))\/(fyi\.frontpage\.feed\.(?:post|comment)|fyi\.unravel\.frontpage\.(?:post|comment))\/([a-z2-7]{13})$/

export const frontpageKey = (uri: string) => storyKey({ kind: 'fp', uri })
export function uriFromKey(key: string): string | undefined {
  const p = parseStoryKey(key)
  return p?.kind === 'fp' && AT_URI.test(p.uri) ? p.uri : undefined
}

/* ---------------------------------------------------------- identities */

const servers = new Map<string, { pds: string; at: number }>()

/** Where a DID's repo lives: its DID document's #atproto_pds service. */
async function pdsOf(did: string): Promise<string> {
  const hit = servers.get(did)
  if (hit && Date.now() - hit.at < 3_600_000) return hit.pds
  const url = did.startsWith('did:plc:') ? `https://plc.directory/${did}` : `https://${decodeURIComponent(did.slice('did:web:'.length)).replace(/:/g, '/')}/.well-known/did.json`
  const doc = await fetchJson<{ service?: { id: string; type: string; serviceEndpoint: string }[] }>(url, { timeoutMs: 6000 })
  const pds = doc.service?.find((s) => s.id.endsWith('#atproto_pds') || s.type === 'AtprotoPersonalDataServer')?.serviceEndpoint
  if (!pds || !/^https:\/\//.test(pds)) throw new Error(`No server for ${did}`)
  servers.set(did, { pds, at: Date.now() })
  return pds
}

/** Verified handles for DIDs, from Bluesky's public API, 25 at a time. */
export async function handles(dids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [...new Set(dids)]
  for (let i = 0; i < unique.length; i += 25) {
    const qs = unique
      .slice(i, i + 25)
      .map((d) => `actors=${encodeURIComponent(d)}`)
      .join('&')
    const res = await fetchJson<{ profiles: { did: string; handle: string }[] }>(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?${qs}`).catch(() => ({ profiles: [] }))
    for (const p of res.profiles) if (p.handle && p.handle !== 'handle.invalid') out.set(p.did, p.handle)
  }
  return out
}

interface RecordView<T> {
  uri: string
  cid: string
  value: T
}

export async function getRecord<T>(uri: string): Promise<RecordView<T>> {
  const [, , did, collection, rkey] = uri.split('/')
  const pds = await pdsOf(did)
  return fetchJson<RecordView<T>>(`${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${collection}&rkey=${rkey}`, { timeoutMs: 6000 })
}

/** Runs `fn` over `items`, a few at a time: kind to the servers involved. */
export async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i]).catch(() => undefined)
      }
    }),
  )
  return out
}

/* --------------------------------------------------------------- counts */

type Links = Record<string, Record<string, { records: number; distinct_dids: number }>>

/** Votes (distinct accounts, so one can't stack them) and comments on a record, both namespaces. */
async function tally(uri: string): Promise<{ votes: number; comments: number }> {
  const { links } = await fetchJson<{ links: Links }>(`${CONSTELLATION}/links/all?target=${encodeURIComponent(uri)}`, { timeoutMs: 6000 })
  let votes = 0
  let comments = 0
  for (const [collection, paths] of Object.entries(links)) {
    if (/^fyi\.(frontpage\.feed|unravel\.frontpage)\.vote$/.test(collection)) votes += paths['.subject.uri']?.distinct_dids ?? 0
    if (/^fyi\.(frontpage\.feed|unravel\.frontpage)\.comment$/.test(collection)) comments += paths['.post.uri']?.records ?? 0
  }
  return { votes, comments }
}

/* ---------------------------------------------------------------- feeds */

interface PostRecord {
  title: string
  url?: string
  subject?: { url?: string }
  createdAt: string
}

const webUrl = (uri: string, handle?: string) => {
  const [, , did, , rkey] = uri.split('/')
  return `https://frontpage.fyi/post/${handle ?? did}/${rkey}`
}

function toStory(view: RecordView<PostRecord>, handle: string | undefined, counts: { votes: number; comments: number }): Story {
  const url = view.value.subject?.url ?? view.value.url ?? null
  let site: string | undefined
  try {
    site = url ? new URL(url).hostname.replace(/^www\./, '') : undefined
  } catch {
    site = undefined
  }
  return {
    key: frontpageKey(view.uri),
    source: 'frontpage',
    sourceLabel: 'Frontpage',
    title: stripHtml(view.value.title).slice(0, 300),
    url: url && /^https?:\/\//.test(url) ? url : null,
    discussionUrl: webUrl(view.uri, handle),
    author: handle ?? view.uri.split('/')[2],
    // Frontpage counts the poster's own implicit vote; so does this.
    score: counts.votes + 1,
    comments: counts.comments,
    createdAt: Math.min(Date.parse(view.value.createdAt) || Date.now(), Date.now()),
    hasThread: true,
    ref: { uri: view.uri, cid: view.cid },
    site,
  }
}

export async function frontpageFeed(feed: FrontpageFeed, limit = 40): Promise<Story[]> {
  const generator = `at://${FEED_DID}/fyi.frontpage.feed.generator/${feed}`
  const skeleton = await fetchJson<{ feed: { post: string }[] }>(`https://frontpage.fyi/xrpc/fyi.frontpage.feed.getFeedSkeleton?feed=${encodeURIComponent(generator)}&limit=${limit}`)
  return frontpageStories(skeleton.feed.map((f) => f.post))
}

/** Frontpage posts by URI, as stories: records from their authors, counts from Constellation. */
export async function frontpageStories(postUris: string[]): Promise<Story[]> {
  const uris = postUris.filter((u) => AT_URI.test(u) && /\.post\//.test(u))
  const [records, counts, names] = await Promise.all([pool(uris, 10, (u) => getRecord<PostRecord>(u)), pool(uris, 10, tally), handles(uris.map((u) => u.split('/')[2]))])
  return records.flatMap((r, i) => (r?.value?.title ? [toStory(r, names.get(r.uri.split('/')[2]), counts[i] ?? { votes: 0, comments: 0 })] : []))
}

/* --------------------------------------------------------------- threads */

interface CommentRecord {
  /** fyi.frontpage.feed.comment: plain-text paragraphs. */
  blocks?: { content?: { $type?: string; text?: string } }[]
  /** fyi.unravel.frontpage.comment: one string. */
  content?: string
  parent?: { uri: string; cid: string }
  post: { uri: string; cid: string }
  createdAt: string
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** A comment's text as paragraphs, links made clickable. */
function commentHtml(c: CommentRecord): string {
  const text = c.blocks ? c.blocks.map((b) => b.content?.text ?? '').join('\n\n') : (c.content ?? '')
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map(
      (p) =>
        `<p>${escapeHtml(p.trim())
          .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]]/g, (u) => `<a href="${u}">${u}</a>`)
          .replace(/\n/g, '<br>')}</p>`,
    )
    .join('')
}

/** Every record of `collection` whose `path` points at `uri`, a page at a time. */
async function backlinks(uri: string, collection: string, path: string, max = 100): Promise<string[]> {
  const out: string[] = []
  let cursor: string | null = null
  do {
    const res: { linking_records: { did: string; collection: string; rkey: string }[]; cursor: string | null } = await fetchJson(
      `${CONSTELLATION}/links?target=${encodeURIComponent(uri)}&collection=${collection}&path=${path}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      { timeoutMs: 8000 },
    )
    for (const r of res.linking_records) out.push(`at://${r.did}/${r.collection}/${r.rkey}`)
    cursor = res.cursor
  } while (cursor && out.length < max)
  return out.slice(0, max)
}

export async function frontpageThread(key: string): Promise<Thread> {
  const uri = uriFromKey(key)
  if (!uri) throw new Error('Not a Frontpage post')
  const [post, counts] = await Promise.all([getRecord<PostRecord>(uri), tally(uri).catch(() => ({ votes: 0, comments: 0 }))])
  const found = (await Promise.all(['fyi.frontpage.feed.comment', 'fyi.unravel.frontpage.comment'].map((c) => backlinks(uri, c, '.post.uri').catch(() => [])))).flat()
  const views = (await pool(found, 10, (u) => getRecord<CommentRecord>(u))).filter((v): v is RecordView<CommentRecord> => !!v && v.value?.post?.uri === uri)
  const votes = await pool(views, 10, (v) => tally(v.uri))
  const names = await handles([uri.split('/')[2], ...views.map((v) => v.uri.split('/')[2])])

  const byUri = new Map<string, Comment>()
  views.forEach((v, i) => {
    const did = v.uri.split('/')[2]
    byUri.set(v.uri, {
      id: v.uri,
      author: names.get(did) ?? did,
      html: commentHtml(v.value),
      createdAt: Math.min(Date.parse(v.value.createdAt) || Date.now(), Date.now()),
      score: votes[i]?.votes ?? 0,
      url: `${webUrl(uri, names.get(uri.split('/')[2]))}/${names.get(did) ?? did}/${v.uri.split('/').pop()}`,
      ref: { uri: v.uri, cid: v.cid },
      children: [],
    })
  })
  const roots: Comment[] = []
  for (const v of views) {
    const node = byUri.get(v.uri)!
    const parent = v.value.parent ? byUri.get(v.value.parent.uri) : undefined
    ;(parent ? parent.children : roots).push(node)
  }
  // Best first: the most voted, then the oldest, at every level.
  const order = (cs: Comment[]): Comment[] => cs.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.createdAt - b.createdAt).map((c) => ({ ...c, children: order(c.children) }))
  return { story: toStory(post, names.get(uri.split('/')[2]), counts), comments: order(roots) }
}

/* -------------------------------------------------------------- activity */

export interface FrontpageActivity {
  posts: Story[]
  comments: { uri: string; text: string; createdAt: number; postKey: string; votes: number }[]
  replies: { uri: string; author: string; text: string; createdAt: number; postKey: string; to: 'post' | 'comment'; subject: string }[]
}

const DID = /^did:(?:plc:[a-z2-7]{24}|web:[a-z0-9.%:-]+)$/

/** A member's recent records of one collection, newest first, read from their own server. */
export async function listRecords<T>(did: string, collection: string, limit = 25): Promise<RecordView<T>[]> {
  const pds = await pdsOf(did)
  const res = await fetchJson<{ records: RecordView<T>[] }>(`${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${collection}&limit=${limit}`, {
    timeoutMs: 8000,
  }).catch(() => ({ records: [] }))
  return res.records
}

const plain = (c: CommentRecord) => (c.blocks ? c.blocks.map((b) => b.content?.text ?? '').join('\n\n') : (c.content ?? '')).trim()

/**
 * Someone's Frontpage activity: their posts (with votes and comments), their comments, and the
 * replies to either, newest first. Frontpage has no notifications of its own; replies are found
 * through Constellation, like everything else here.
 */
export async function frontpageActivity(did: string): Promise<FrontpageActivity> {
  if (!DID.test(did)) throw new Error('Not an atproto account')
  const [newPosts, oldPosts, newComments, oldComments] = await Promise.all([
    listRecords<PostRecord>(did, 'fyi.frontpage.feed.post'),
    listRecords<PostRecord>(did, 'fyi.unravel.frontpage.post'),
    listRecords<CommentRecord>(did, 'fyi.frontpage.feed.comment'),
    listRecords<CommentRecord>(did, 'fyi.unravel.frontpage.comment'),
  ])
  const postViews = [...newPosts, ...oldPosts].filter((p) => p.value?.title).slice(0, 25)
  const commentViews = [...newComments, ...oldComments].filter((c) => c.value?.post?.uri).slice(0, 25)
  const [postCounts, commentCounts] = await Promise.all([pool(postViews, 8, (p) => tally(p.uri)), pool(commentViews, 8, (c) => tally(c.uri))])
  const names = await handles([did])
  const posts = postViews.map((p, i) => toStory(p, names.get(did), postCounts[i] ?? { votes: 0, comments: 0 }))
  const comments = commentViews.map((c, i) => ({
    uri: c.uri,
    text: plain(c.value).slice(0, 400),
    createdAt: Date.parse(c.value.createdAt) || 0,
    postKey: frontpageKey(c.value.post.uri),
    votes: commentCounts[i]?.votes ?? 0,
  }))

  // Replies: comments on your posts, and replies to your comments, by anyone else.
  const targets = [
    ...postViews.filter((_, i) => (postCounts[i]?.comments ?? 0) > 0).map((p) => ({ uri: p.uri, path: '.post.uri', postUri: p.uri, to: 'post' as const, subject: p.value.title })),
    ...commentViews.map((c) => ({ uri: c.uri, path: '.parent.uri', postUri: c.value.post.uri, to: 'comment' as const, subject: plain(c.value).slice(0, 140) })),
  ].slice(0, 30)
  const found = await pool(targets, 6, async (t) => {
    const uris = (await Promise.all(['fyi.frontpage.feed.comment', 'fyi.unravel.frontpage.comment'].map((col) => backlinks(t.uri, col, t.path, 20).catch(() => [])))).flat()
    return uris.filter((u) => u.split('/')[2] !== did).map((u) => ({ uri: u, t }))
  })
  const wanted = found.flatMap((f) => f ?? []).slice(0, 40)
  const records = await pool(wanted, 8, (w) => getRecord<CommentRecord>(w.uri))
  const authors = await handles(wanted.map((w) => w.uri.split('/')[2]))
  // A comment on your post that's a reply to someone else's comment is theirs to hear about, not yours.
  const replies = wanted.flatMap((w, i) => {
    const r = records[i]
    if (!r?.value) return []
    if (w.t.to === 'post' && r.value.parent) return []
    const author = w.uri.split('/')[2]
    return [
      {
        uri: w.uri,
        author: authors.get(author) ?? author,
        text: plain(r.value).slice(0, 400),
        createdAt: Date.parse(r.value.createdAt) || 0,
        postKey: frontpageKey(w.t.postUri),
        to: w.t.to,
        subject: w.t.subject,
      },
    ]
  })
  return { posts, comments, replies: replies.sort((a, b) => b.createdAt - a.createdAt) }
}
