import { cleanSubmission, communityUrl, PAPERWING_SITE, type PaperwingSort } from '../../src/lib/paperwing.js'
import { BOARD_HIDE_NSID, BOARD_NSID, cleanBoard, cleanBoardHide, type Board } from '../../src/lib/social.js'
import type { Story } from '../../src/lib/types.js'
import { linking, posts } from './atlinks.js'
import { type PostView, toStory } from './bsky.js'
import { getRecord, handles, pool } from './frontpage.js'
import { fetchJson } from './http.js'
import { kv, kvConfigured } from './kv.js'
import { blocked, rank, submissions, unlisted } from './paperwing.js'

// Community boards: a board is a record in its owner's Bluesky account (social.ts). Its listings are
// submissions linking to its page (found through Constellation), its votes and comments are the
// posts' Bluesky likes and replies, and its moderation is two open things: hides written by the
// moderators it names, and a Bluesky moderation list whose accounts are kept out. No database.

const APPVIEW = 'https://public.api.bsky.app/xrpc'
const DID = /^did:(?:plc:[a-z2-7]{24}|web:[a-z0-9.%:-]+)$/
const RKEY = /^[a-z2-7]{13}$/

export interface BoardView extends Board {
  uri: string
  owner: string
  ownerHandle?: string
  moderatorHandles: Record<string, string>
}

export async function readBoard(did: string, rkey: string): Promise<BoardView> {
  if (!DID.test(did) || !RKEY.test(rkey)) throw new Error('Not a board')
  const uri = `at://${did}/${BOARD_NSID}/${rkey}`
  const record = await getRecord<unknown>(uri)
  const board = cleanBoard(record.value)
  if (!board) throw new Error('That board is empty or malformed')
  const names = await handles([did, ...board.moderators])
  return { ...board, uri, owner: did, ownerHandle: names.get(did), moderatorHandles: Object.fromEntries(board.moderators.flatMap((m) => (names.get(m) ? [[m, names.get(m)!]] : []))) }
}

/** The accounts on a Bluesky moderation list, up to a thousand. */
async function listMembers(list: string): Promise<Set<string>> {
  const out = new Set<string>()
  let cursor: string | undefined
  for (let page = 0; page < 10; page++) {
    const res = await fetchJson<{ items: { subject: { did: string } }[]; cursor?: string }>(
      `${APPVIEW}/app.bsky.graph.getList?list=${encodeURIComponent(list)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      { timeoutMs: 6000 },
    )
    for (const i of res.items) out.add(i.subject.did)
    cursor = res.cursor
    if (!cursor) break
  }
  return out
}

/** Listings a board's moderators have hidden: hides by anyone else don't count. */
async function hiddenOn(board: BoardView): Promise<Set<string>> {
  const uris = await linking(board.uri, BOARD_HIDE_NSID, '.board', 200).catch(() => [])
  const mods = new Set([board.owner, ...board.moderators])
  const records = await pool(
    uris.filter((u) => mods.has(u.split('/')[2])),
    10,
    (u) => getRecord<unknown>(u).catch(() => undefined),
  )
  return new Set(records.flatMap((r) => (r ? (cleanBoardHide(r.value)?.board === board.uri ? [cleanBoardHide(r.value)!.subject] : []) : [])))
}

/** A community board and its listings, ranked like the front page, with its moderation applied. Cached a minute. */
export async function boardFront(did: string, rkey: string, sort: PaperwingSort): Promise<{ board: BoardView; stories: Story[] }> {
  const key = `rd:board:${did}:${rkey}:${sort}`
  if (kvConfigured()) {
    const hit = await kv()
      .get(key)
      .catch(() => null)
    if (hit) return JSON.parse(hit) as { board: BoardView; stories: Story[] }
  }
  const board = await readBoard(did, rkey)
  const [uris, hidden, kept] = await Promise.all([
    submissions(communityUrl(did, rkey), '.boardUrl', 200),
    hiddenOn(board),
    board.blockList ? listMembers(board.blockList).catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
  ])
  const records = await pool(uris, 10, (u) => getRecord<unknown>(u).catch(() => undefined))
  const off = blocked()
  const subs = records.flatMap((r, i) => {
    const s = r ? cleanSubmission(r.value) : undefined
    const author = uris[i].split('/')[2]
    if (!s || s.community !== board.uri || s.post.uri.split('/')[2] !== author) return []
    if (hidden.has(s.post.uri) || kept.has(author) || off.has(author) || off.has(s.post.uri)) return []
    return [s]
  })
  const found: PostView[] = (await posts([...new Set(subs.map((s) => s.post.uri))])).filter((p) => !unlisted(p))
  const stories = rank(found, sort)
    .slice(0, 80)
    .map((p) => ({ ...toStory(p), sourceLabel: board.name }))
  const out = { board, stories }
  if (kvConfigured())
    await kv()
      .set(key, JSON.stringify(out), 60)
      .catch(() => {})
  return out
}

/** Every community board, newest first (boards carry PaperWing's address, so Constellation lists them). */
export async function allBoards(): Promise<BoardView[]> {
  const uris = await linking(PAPERWING_SITE, BOARD_NSID, '.site', 100).catch(() => [])
  const found = await pool(uris, 10, (u) => {
    const [, , did, , rkey] = u.split('/')
    return readBoard(did, rkey).catch(() => undefined)
  })
  return found.filter((b): b is BoardView => !!b).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}
