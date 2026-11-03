import { describe, expect, it, vi } from 'vitest'
import type { Story } from '../../src/lib/types.js'
import type { BoardView } from './boards.js'

// Board suggestions: the liveliest community boards' best posts, the same for everyone. Faked at
// the boards module's edge: the board list and each board's ranked, moderated listings.
const board = (n: number, active: number, extra: Partial<BoardView> = {}): BoardView => ({
  uri: `at://did:plc:owner${n}/io.paperwing.board/3m2board${String(n).padStart(5, 'a')}`,
  owner: `did:plc:owner${n}`,
  name: `Board ${n}`,
  moderators: [],
  moderatorHandles: {},
  createdAt: '2026-11-01T00:00:00Z',
  official: false,
  active,
  ...extra,
})
// Every board's posts alternate: odd ones also on PaperWing's front page, even ones on the board only.
const post = (n: number, i: number): Story => ({
  key: `bs-${n}-${i}`,
  source: 'bluesky',
  sourceLabel: `Board ${n}`,
  title: `Post ${i} on ${n}`,
  url: null,
  discussionUrl: null,
  createdAt: 0,
  hasThread: true,
  ...(i % 2 ? { onFront: true } : {}),
})

// Board 30 is lively but listed last: picking by activity, not list order, has to find it.
const boards = [board(1, 5), board(2, 0), board(3, 9), board(4, 2, { official: true }), ...Array.from({ length: 10 }, (_, i) => board(10 + i, 1)), board(30, 7)]
const unreadable = new Set(['did:plc:owner3'])
const reads: string[] = []
vi.mock('./boards.js', () => ({
  allBoards: vi.fn(async () => boards),
  boardFront: vi.fn(async (did: string) => {
    reads.push(did)
    if (unreadable.has(did)) throw new Error('moderation unreadable')
    const n = Number(did.replace('did:plc:owner', ''))
    return { board: boards.find((b) => b.owner === did)!, stories: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => post(n, i)) }
  }),
}))

const { boardPicks, PICK_BOARDS, PICKS_PER_BOARD } = await import('./boardPicks.js')

describe('board suggestions', () => {
  it('takes the best few posts from the liveliest boards, marked as suggestions with their board', async () => {
    const picks = await boardPicks()
    expect(picks.every((s) => s.recommended && s.board && !s.board.official)).toBe(true)
    expect(new Set(picks.map((s) => s.board!.uri)).size).toBeLessThanOrEqual(PICK_BOARDS)
    // Only what their authors also put on the front page: a board-only post stays on its board.
    expect(picks.filter((s) => s.board!.uri === boards[0].uri).map((s) => s.key)).toEqual(['bs-1-1', 'bs-1-3', 'bs-1-5'].slice(0, PICKS_PER_BOARD))
    expect(picks.some((s) => s.board!.uri === boards.at(-1)!.uri)).toBe(true)
  })

  it('is an error, not an empty list everyone keeps for minutes, when no board can be read', async () => {
    for (const b of boards) unreadable.add(b.owner)
    try {
      await expect(boardPicks()).rejects.toThrow()
    } finally {
      unreadable.clear()
      unreadable.add('did:plc:owner3')
    }
  })

  it('never suggests an official board (announcements have their own place), a quiet one, or one whose moderation can’t be read', async () => {
    reads.length = 0
    const owners = new Set((await boardPicks()).map((s) => s.board!.uri.split('/')[2]))
    expect(owners.has('did:plc:owner4')).toBe(false)
    expect(owners.has('did:plc:owner2')).toBe(false)
    expect(owners.has('did:plc:owner3')).toBe(false)
    expect(reads).toContain('did:plc:owner3')
    expect(reads.length).toBe(PICK_BOARDS)
  })
})
