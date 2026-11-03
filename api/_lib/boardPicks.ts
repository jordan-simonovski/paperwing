import type { Story } from '../../src/lib/types.js'
import { allBoards, boardFront } from './boards.js'
import { cachedInKv } from './kv.js'
import { pool } from './frontpage.js'

// Suggestions for For you: the best few posts from the liveliest community boards, so boards are
// found from the main feed. The same answer for everyone: nothing about the reader is sent or
// used. The reader's app drops the boards they've already joined, and can turn suggestions off.
// Each board's posts come from its own page's ranking (boardFront), moderation and all; a board
// whose moderation can't be read is left out, as on its own page.

/** How many boards are suggested from at most. */
export const PICK_BOARDS = 8
/** How many of each board's best posts are suggested. */
export const PICKS_PER_BOARD = 3

export function boardPicks(): Promise<Story[]> {
  return cachedInKv('rd:boardpicks', 300, async () => {
    // Official boards are announcements, which have their own place; a quiet board has nothing to show.
    const lively = (await allBoards())
      .filter((b) => !b.official && (b.active ?? 0) > 0)
      .sort((a, b) => (b.active ?? 0) - (a.active ?? 0))
      .slice(0, PICK_BOARDS)
    const found = await pool(lively, 4, async (b) => {
      const [, , did, , rkey] = b.uri.split('/')
      const { stories } = await boardFront(did, rkey, 'hot').catch(() => ({ stories: [] as Story[] }))
      return stories.slice(0, PICKS_PER_BOARD).map((s): Story => ({ ...s, recommended: true, board: { uri: b.uri, name: b.name, official: false } }))
    })
    return found.flatMap((s) => s ?? [])
  })
}
