import { boardUrl, PAPERWING_SITE, SUBMISSION_NSID, cleanSubmission, type PaperwingSort } from '../../src/lib/paperwing.js'
import type { Story } from '../../src/lib/types.js'
import { posts } from './atlinks.js'
import { postTime, toStory, type PostView } from './bsky.js'
import { getRecord, pool } from './frontpage.js'
import { fetchJson } from './http.js'
import { kv, kvConfigured } from './kv.js'

// PaperWing's front page. A submission is an ordinary Bluesky post (the link card, the title,
// your take) plus a small io.paperwing.submission record in your own repo pointing at it and
// naming its board. Constellation, the public index of links between atproto records, lists those
// records by the PaperWing address they link to (the site, or a board's page), so finding every
// submission needs no firehose and no database. Votes are the Bluesky post's likes; comments are its
// replies. Ranked like Hacker News: engagement over age, with gravity.

const CONSTELLATION = 'https://constellation.microcosm.blue'
const HOUR = 3_600_000

/** Submission record URIs linking to a target, newest first, a few pages at most. */
export async function submissions(target: string, path: string, max = 300): Promise<string[]> {
  const out: string[] = []
  let cursor: string | null = null
  do {
    const res: { linking_records: { did: string; collection: string; rkey: string }[]; cursor: string | null } = await fetchJson(
      `${CONSTELLATION}/links?target=${encodeURIComponent(target)}&collection=${SUBMISSION_NSID}&path=${encodeURIComponent(path)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      { timeoutMs: 8000 },
    )
    for (const r of res.linking_records) out.push(`at://${r.did}/${r.collection}/${r.rkey}`)
    cursor = res.cursor
  } while (cursor && out.length < max)
  return out.slice(0, max)
}

/** The engagement a post has: likes, replies (worth more: they're the conversation) and reposts. */
const engagement = (p: PostView) => (p.likeCount ?? 0) + 2 * (p.replyCount ?? 0) + (p.repostCount ?? 0)

/** Orders submitted posts: hot (Hacker News gravity), new, or top of the last week. */
export function rank(list: PostView[], sort: PaperwingSort, now = Date.now()): PostView[] {
  const age = (p: PostView) => Math.max(0, now - postTime(p)) / HOUR
  if (sort === 'new') return [...list].sort((a, b) => postTime(b) - postTime(a))
  if (sort === 'top') return list.filter((p) => age(p) < 24 * 7).sort((a, b) => engagement(b) - engagement(a) || postTime(b) - postTime(a))
  return [...list].sort((a, b) => (engagement(b) + 1) / (age(b) + 2) ** 1.6 - (engagement(a) + 1) / (age(a) + 2) ** 1.6)
}

/**
 * Accounts and posts kept off the front page, boards and feeds: PAPERWING_BLOCKED, DIDs or post
 * at:// URIs separated by commas or spaces. The terms (/terms) promise spam and abuse can be
 * removed; this is how, without touching anyone's own Bluesky account.
 */
export const blocked = (env = process.env.PAPERWING_BLOCKED ?? '') => new Set(env.split(/[\s,]+/).filter((s) => /^(did:|at:\/\/)/.test(s)))

/** Labels that keep a post off PaperWing's public pages: moderation takedowns, spam and adult content. */
const UNLISTED = new Set(['!hide', '!takedown', 'spam', 'porn', 'sexual', 'nudity', 'graphic-media', 'gore'])
export const unlisted = (p: PostView) => [...(p.labels ?? []), ...(p.author.labels ?? [])].some((l) => UNLISTED.has(l.val))

/** Submitted Bluesky posts for the site or one board, each once, that still exist. */
async function submittedPosts(board?: string): Promise<{ post: PostView; board?: string }[]> {
  const uris = board ? await submissions(boardUrl(board), '.boardUrl', 200) : await submissions(PAPERWING_SITE, '.site', 300)
  const records = await pool(uris, 10, (u) => getRecord<unknown>(u))
  const subs = records.flatMap((r, i) => {
    const s = r ? cleanSubmission(r.value) : undefined
    // A submission only counts for its own author's post: no listing someone else's.
    return s && s.post.uri.split('/')[2] === uris[i].split('/')[2] ? [s] : []
  })
  const off = blocked()
  const byPost = new Map(subs.filter((s) => !off.has(s.post.uri) && !off.has(s.post.uri.split('/')[2])).map((s) => [s.post.uri, s]))
  const found = (await posts([...byPost.keys()])).filter((p) => !unlisted(p))
  return found.map((p) => ({ post: p, board: byPost.get(p.uri)?.board }))
}

/** The front page (or a board's) as stories, cached for a minute: a new submission shows up soon. */
export async function paperwingFront(sort: PaperwingSort, board?: string): Promise<Story[]> {
  const key = `rd:pw:${board ?? '*'}:${sort}`
  if (kvConfigured()) {
    const hit = await kv()
      .get(key)
      .catch(() => null)
    if (hit) return JSON.parse(hit) as Story[]
  }
  const list = await submittedPosts(board)
  const boards = new Map(list.map((x) => [x.post.uri, x.board]))
  const stories = rank(
    list.map((x) => x.post),
    sort,
  )
    .slice(0, 80)
    .map((p) => ({ ...toStory(p), sourceLabel: 'PaperWing', ...(boards.get(p.uri) ? { tags: [boards.get(p.uri)!] } : {}) }))
  if (kvConfigured())
    await kv()
      .set(key, JSON.stringify(stories), 60)
      .catch(() => {})
  return stories
}

/** The same ranking as post URIs, for PaperWing's Bluesky feeds. */
export async function paperwingFeedUris(sort: PaperwingSort): Promise<string[]> {
  const stories = await paperwingFront(sort)
  return stories.flatMap((s) => (s.ref ? [s.ref.uri] : []))
}
