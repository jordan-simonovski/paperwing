import { boardUrl, PAPERWING_SITE, SUBMISSION_NSID, cleanSubmission, type PaperwingSort, type Submission } from '../../src/lib/paperwing.js'
import { officialFrom } from '../../src/lib/boardFinder.js'
import { cleanBoard, type Board } from '../../src/lib/social.js'
import type { Story } from '../../src/lib/types.js'
import { posts } from './atlinks.js'
import { boardShows, moderationWithin } from './boardModeration.js'
import { postTime, toStory, type PostView } from './bsky.js'
import { getRecord, pool } from './frontpage.js'
import { fetchJson } from './http.js'
import { cachedInKv } from './kv.js'

// PaperWing's front page. A submission is an ordinary Bluesky post (the link card, the title,
// your take) plus a small io.paperwing.submission record in your own repo pointing at it and
// naming its board. Constellation, the public index of links between atproto records, lists those
// records by the PaperWing address they link to (the site, or a board's page), so finding every
// submission needs no firehose and no database. Votes are the Bluesky post's likes; comments are its
// replies. Ranked like Hacker News: engagement over age, with gravity.

const CONSTELLATION = 'https://constellation.microcosm.blue'
const HOUR = 3_600_000

/** Record URIs in `collection` linking to a target (by `path`), newest first, a few pages at most. */
export async function linksTo(target: string, collection: string, path: string, max = 300): Promise<string[]> {
  const out: string[] = []
  let cursor: string | null = null
  do {
    const res: { linking_records: { did: string; collection: string; rkey: string }[]; cursor: string | null } = await fetchJson(
      `${CONSTELLATION}/links?target=${encodeURIComponent(target)}&collection=${collection}&path=${encodeURIComponent(path)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      { timeoutMs: 8000 },
    )
    for (const r of res.linking_records) out.push(`at://${r.did}/${r.collection}/${r.rkey}`)
    cursor = res.cursor
  } while (cursor && out.length < max)
  return out.slice(0, max)
}

/** Submission record URIs linking to a target, newest first, a few pages at most. */
export const submissions = (target: string, path: string, max = 300) => linksTo(target, SUBMISSION_NSID, path, max)

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

/** Whether a board's owner is one PaperWing names as its own (PAPERWING_OFFICIAL): official boards are marked everywhere. */
export const official = (did: string, setting = process.env.PAPERWING_OFFICIAL ?? '') => officialFrom(setting)(did)

/** An official announcement stays at the top of the front page this long. */
const PINNED_FOR = 72 * HOUR
const FRONT_LENGTH = 80
/** How long the front page waits on a board's moderation before leaving the board's listings out. */
const MODERATION_WAIT = 4000

/** Labels that keep a post off PaperWing's public pages: moderation takedowns, spam and adult content. */
const UNLISTED = new Set(['!hide', '!takedown', 'spam', 'porn', 'sexual', 'nudity', 'graphic-media', 'gore'])
export const unlisted = (p: PostView) => [...(p.labels ?? []), ...(p.author.labels ?? [])].some((l) => UNLISTED.has(l.val))

/**
 * Submitted Bluesky posts for the site or one board, each once, that still exist. The front page
 * has a community board's listings only when their poster put them there too.
 */
async function submittedPosts(board?: string): Promise<{ post: PostView; sub: Submission }[]> {
  const uris = board ? await submissions(boardUrl(board), '.boardUrl', 200) : await submissions(PAPERWING_SITE, '.site', 300)
  const records = await pool(uris, 10, (u) => getRecord<unknown>(u))
  const subs = records.flatMap((r, i) => {
    const s = r ? cleanSubmission(r.value) : undefined
    // A submission only counts for its own author's post: no listing someone else's.
    if (!s || s.post.uri.split('/')[2] !== uris[i].split('/')[2]) return []
    return board || !s.community || s.front ? [s] : []
  })
  const off = blocked()
  const byPost = new Map(subs.filter((s) => !off.has(s.post.uri) && !off.has(s.post.uri.split('/')[2])).map((s) => [s.post.uri, s]))
  const found = (await posts([...byPost.keys()])).filter((p) => !unlisted(p))
  return found.map((p) => ({ post: p, sub: byPost.get(p.uri)! }))
}

/** Community boards, read from their owners' repos (a board that can't be read is left out). */
async function boardsByUri(uris: string[]): Promise<Map<string, Board>> {
  const out = new Map<string, Board>()
  const found = await pool(uris, 10, (u) => getRecord<unknown>(u))
  found.forEach((r, i) => {
    const b = r ? cleanBoard(r.value) : undefined
    if (b) out.set(uris[i], b)
  })
  return out
}

/** The front page (or a board's) as stories, cached for a minute: a new submission shows up soon. */
export async function paperwingFront(sort: PaperwingSort, board?: string, now = Date.now()): Promise<Story[]> {
  return cachedInKv(`rd:pw:${board ?? '*'}:${sort}`, 60, async () => {
    const all = await submittedPosts(board)
    // On the front page, a board's listing says which board it's from, and counts only if its
    // author may post there (a board that can't be read can't vouch for it).
    const boards = board ? new Map<string, Board>() : await boardsByUri([...new Set(all.flatMap((x) => (x.sub.community ? [x.sub.community] : [])))])
    // Its moderators' hides and block list follow a board's listings here. A board whose moderation
    // can't be read, or not quickly, keeps its listings off the front page until it can: one slow
    // moderator's server mustn't hold the whole page up.
    const read = [...boards]
    const mods = await pool(read, 10, ([u, b]) => moderationWithin(u, b, MODERATION_WAIT))
    const moderation = new Map(read.map(([u], i) => [u, mods[i]]))
    const off = blocked()
    const list = all.filter(({ post, sub }) => {
      if (board || !sub.community) return true
      const b = boards.get(sub.community)
      const mod = moderation.get(sub.community)
      const owner = sub.community.split('/')[2]
      return !!b && !!mod && !off.has(owner) && !off.has(sub.community) && boardShows(b, owner, official(owner), mod, post.uri, post.author.did)
    })
    const subs = new Map(list.map((x) => [x.post.uri, x.sub]))
    const names = new Map([...boards].map(([u, b]) => [u, b.name]))
    const ranked = rank(
      list.map((x) => x.post),
      sort,
      now,
    ).map((p): Story => {
      const s = subs.get(p.uri)!
      const name = s.community ? names.get(s.community) : undefined
      return {
        ...toStory(p),
        sourceLabel: 'PaperWing',
        ...(s.board ? { tags: [s.board] } : {}),
        ...(s.community && name ? { board: { uri: s.community, name, official: official(s.community.split('/')[2]) } } : {}),
      }
    })
    if (board || sort === 'new') return ranked.slice(0, FRONT_LENGTH)
    // The newest official announcement from the last few days leads the front page, however far
    // down the ranking it would otherwise be.
    const pin = ranked.filter((s) => s.board?.official && now - s.createdAt < PINNED_FOR).sort((a, b) => b.createdAt - a.createdAt)[0]
    if (!pin) return ranked.slice(0, FRONT_LENGTH)
    return [{ ...pin, pinned: true }, ...ranked.filter((s) => s !== pin).slice(0, FRONT_LENGTH - 1)]
  })
}

/** The same ranking as post URIs, for PaperWing's Bluesky feeds. */
export async function paperwingFeedUris(sort: PaperwingSort): Promise<string[]> {
  const stories = await paperwingFront(sort)
  return stories.flatMap((s) => (s.ref ? [s.ref.uri] : []))
}
