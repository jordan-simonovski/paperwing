import { BOARD_HIDE_NSID, cleanBoardHide, type Board } from '../../src/lib/social.js'
import { listAllRecords } from './frontpage.js'
import { fetchJson } from './http.js'

// A community board's moderation, wherever its listings show (its own page, the front page): hides
// written by the moderators it names, and the accounts on its Bluesky moderation list.

const APPVIEW = 'https://public.api.bsky.app/xrpc'

/** The accounts on a Bluesky moderation list, up to a thousand; a longer one fails rather than half-read. */
async function listMembers(list: string): Promise<Set<string>> {
  const out = new Set<string>()
  let cursor: string | undefined
  for (let page = 0; page < 10; page++) {
    const res = await fetchJson<{ items: { subject: { did: string } }[]; cursor?: string }>(
      `${APPVIEW}/app.bsky.graph.getList?list=${encodeURIComponent(list)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      { timeoutMs: 6000 },
    ).catch((err: unknown) => {
      // A list its owner deleted keeps nobody out. Anything else, or a page after the first going
      // missing, fails the board: half a block list would let the rest in.
      if (page === 0 && isGone(err)) return { items: [], cursor: undefined }
      throw err
    })
    for (const i of res.items) out.add(i.subject.did)
    cursor = res.cursor
    if (!cursor) return out
  }
  // Part of a block list would let the rest in.
  throw new Error(`More than 1000 accounts on ${list}`)
}

/**
 * Listings a board's moderators have hidden, read from each moderator's own repo: hides by anyone
 * else don't count, and however many others write, they can't crowd a moderator's out or get in
 * the way. Throws when a moderator's hides can't be read: an empty set would put what was hidden back.
 */
async function hiddenOn(uri: string, board: Board): Promise<Set<string>> {
  const mine = await Promise.all([uri.split('/')[2], ...board.moderators].map((did) => listAllRecords<unknown>(did, BOARD_HIDE_NSID)))
  return new Set(
    mine.flat().flatMap((r) => {
      const hide = cleanBoardHide(r.value)
      return hide?.board === uri ? [hide.subject] : []
    }),
  )
}

/** The network answered that the record or list isn't there (atproto says 400 for a missing record). */
const isGone = (err: unknown) => err instanceof Error && /\bUpstream 40[04]\b/.test(err.message)

/**
 * The listings a board's moderators hid and the accounts its block list keeps out. Throws when
 * either can't be read: whoever shows the board's listings must not show them unmoderated.
 */
export async function moderationOf(uri: string, board: Board): Promise<{ hidden: Set<string>; kept: Set<string> }> {
  const [hidden, kept] = await Promise.all([hiddenOn(uri, board), board.blockList ? listMembers(board.blockList) : Promise.resolve(new Set<string>())])
  return { hidden, kept }
}
