import type { Story } from '../../src/lib/types.js'
import { allBoards, boardFront } from './boards.js'
import { cachedInKv, kv, kvConfigured } from './kv.js'
import { pool } from './frontpage.js'
import { paperwingFront } from './paperwing.js'

// Suggestions for For you: the best few posts from the liveliest community boards, so boards are
// found from the main feed. The same answer for everyone: nothing about the reader is sent or
// used. The reader's app stops calling a joined board's posts suggestions, and can turn them off.
// Each board's posts come from its own page's ranking (boardFront), moderation and all; a board
// whose moderation can't be read is left out, as on its own page. Only listings their posters
// also put on PaperWing's front page are suggested (a board-only post stays on its board), and
// only ones that aren't on it now: For you has those anyway, with a Join button of their own.

/** How many boards are suggested from at most. */
export const PICK_BOARDS = 8
/** How many of each board's best posts are suggested. */
export const PICKS_PER_BOARD = 3

/** Set for half a minute when no board could be read: an outage isn't walked again on every request. */
const DOWN = 'rd:boardpicks:down'

export async function boardPicks(): Promise<Story[]> {
  if (
    kvConfigured() &&
    (await kv()
      .get(DOWN)
      .catch(() => null))
  )
    throw new Error('Board suggestions are unavailable: try again shortly')
  // Two minutes: a moderator's hide on a board reaches its suggestions soon.
  return cachedInKv('rd:boardpicks', 120, async () => {
    const front = new Set((await paperwingFront('hot').catch(() => [] as Story[])).map((s) => s.key))
    // Official boards are announcements, which have their own place; a quiet board has nothing to show.
    const lively = (await allBoards())
      .filter((b) => !b.official && (b.active ?? 0) > 0)
      .sort((a, b) => (b.active ?? 0) - (a.active ?? 0))
      .slice(0, PICK_BOARDS)
    const found = await pool(lively, 4, async (b) => {
      const [, , did, , rkey] = b.uri.split('/')
      const read = await boardFront(did, rkey, 'hot').catch(() => undefined)
      return read?.stories
        .filter((s) => s.onFront && !front.has(s.key))
        .slice(0, PICKS_PER_BOARD)
        .map((s): Story => ({ ...s, recommended: true, board: { uri: b.uri, name: b.name, official: false } }))
    })
    // Not one board could be read: an error (not cached), not an empty list everyone keeps for minutes.
    if (lively.length && found.every((f) => !f)) {
      if (kvConfigured())
        await kv()
          .set(DOWN, '1', 30)
          .catch(() => {})
      throw new Error('No board could be read')
    }
    return found.flatMap((s) => s ?? [])
  })
}
