import { cleanSubmission, communityUrl, PAPERWING_SITE, SUBMISSION_NSID, type PaperwingSort } from '../../src/lib/paperwing.js'
import { tidTime } from '../../src/lib/boardFinder.js'
import { BOARD_NSID, canPost, cleanBoard, type Board } from '../../src/lib/social.js'
import type { Story } from '../../src/lib/types.js'
import { posts } from './atlinks.js'
import { type PostView, toStory } from './bsky.js'
import { boardShows, moderationOf } from './boardModeration.js'
import { getRecord, handles, pool } from './frontpage.js'
import { cachedInKv } from './kv.js'
import { blocked, linksTo, official, rank, submissions, unlisted } from './paperwing.js'

// Community boards: a board is a record in its owner's Bluesky account (social.ts). Its listings are
// submissions linking to its page (found through Constellation), its votes and comments are the
// posts' Bluesky likes and replies, and its moderation is two open things: hides written by the
// moderators it names, and a Bluesky moderation list whose accounts are kept out. No database.

const DID = /^did:(?:plc:[a-z2-7]{24}|web:[a-z0-9.%:-]+)$/
const RKEY = /^[a-z2-7]{13}$/

export interface BoardView extends Board {
  uri: string
  owner: string
  ownerHandle?: string
  moderatorHandles: Record<string, string>
  /** Run by PaperWing itself (its owner is PaperWing's own account): never claimed by the board. */
  official: boolean
  /** Listings in the last week, where the board list counts them. */
  active?: number
}

export async function readBoard(did: string, rkey: string): Promise<BoardView> {
  if (!DID.test(did) || !RKEY.test(rkey)) throw new Error('Not a board')
  const uri = `at://${did}/${BOARD_NSID}/${rkey}`
  const record = await getRecord<unknown>(uri)
  const board = cleanBoard(record.value)
  if (!board) throw new Error('That board is empty or malformed')
  const names = await handles([did, ...board.moderators])
  return {
    ...board,
    uri,
    owner: did,
    ownerHandle: names.get(did),
    moderatorHandles: Object.fromEntries(board.moderators.flatMap((m) => (names.get(m) ? [[m, names.get(m)!]] : []))),
    official: official(did),
  }
}

/**
 * A community board and its listings, ranked like the front page, with its moderation applied.
 * Cached a minute. When its hides or block list can't be read it throws, so a board is never
 * served or cached without its moderation.
 */
export async function boardFront(did: string, rkey: string, sort: PaperwingSort): Promise<{ board: BoardView; stories: Story[] }> {
  return cachedInKv(`rd:board:${did}:${rkey}:${sort}`, 60, async () => {
    const board = await readBoard(did, rkey)
    const [uris, mod] = await Promise.all([submissions(communityUrl(did, rkey), '.boardUrl', 200), moderationOf(board.uri, board)])
    const records = await pool(uris, 10, (u) => getRecord<unknown>(u).catch(() => undefined))
    const off = blocked()
    const subs = records.flatMap((r, i) => {
      const s = r ? cleanSubmission(r.value) : undefined
      const author = uris[i].split('/')[2]
      if (!s || s.community !== board.uri || s.post.uri.split('/')[2] !== author) return []
      if (!boardShows(board, board.owner, board.official, mod, s.post.uri, author) || off.has(author) || off.has(s.post.uri)) return []
      return [s]
    })
    const found: PostView[] = (await posts([...new Set(subs.map((s) => s.post.uri))])).filter((p) => !unlisted(p))
    const stories = rank(found, sort)
      .slice(0, 80)
      .map((p) => ({ ...toStory(p), sourceLabel: board.name }))
    return { board, stories }
  })
}

/**
 * Every community board (boards carry PaperWing's address, so Constellation lists them), each with
 * how many people posted to it this week. A listing's record key says when it was made, so counting
 * needs no record reads; counting people rather than records means one account can't make a board
 * look busy, and on a board where only moderators post only they count. Up to 500 boards.
 */
export async function allBoards(): Promise<BoardView[]> {
  const off = blocked()
  // An index that can't be read is an error, not an empty list: errors aren't cached, so readers keep the list they had.
  const uris = (await linksTo(PAPERWING_SITE, BOARD_NSID, '.site', 500)).filter((u) => !off.has(u) && !off.has(u.split('/')[2]))
  const now = Date.now()
  const weekAgo = now - 7 * 86_400_000
  const found = await pool(uris, 10, async (u) => {
    const [, , did, , rkey] = u.split('/')
    const [board, listed] = await Promise.all([readBoard(did, rkey), linksTo(communityUrl(did, rkey), SUBMISSION_NSID, '.boardUrl', 100).catch(() => undefined)])
    // Not knowing this week's count isn't the same as a quiet week: leave it out.
    if (!listed) return board
    const people = new Set(
      listed.flatMap((l) => {
        const [, , author, , key] = l.split('/')
        const at = tidTime(key)
        // A key dated in the future isn't this week's.
        const recent = at !== undefined && at > weekAgo && at <= now + 60_000
        return recent && !off.has(author) && canPost(board, board.owner, author, board.official) ? [author] : []
      }),
    )
    return { ...board, active: people.size }
  })
  return found.filter((b) => !!b).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}
