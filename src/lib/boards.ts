import { useQuery, type QueryClient } from '@tanstack/react-query'
import { channelId } from './channelId'
import { createContext, useContext } from 'react'
import { createRecord, putRecord, useAtproto } from './atproto'
import { tid } from './mixes'
import { AT_COMMUNITY } from './paperwing'
import { keys } from './query'
import { BOARD_HIDE_NSID, BOARD_NSID, boardRecord, type Board } from './social'
import { usePrefs } from './store'
import type { Story } from './types'

// Community boards (social.ts, api/_lib/boards.ts): spaces with their own name, rules and moderators,
// owned by whoever made them and kept in their Bluesky account. Votes and comments are Bluesky likes
// and replies; moderation is moderators hiding listings and the owner's Bluesky moderation list.

export interface BoardView extends Board {
  uri: string
  owner: string
  ownerHandle?: string
  moderatorHandles: Record<string, string>
}

/** A board you've joined: it gets a channel and shows in the menu. */
export interface JoinedBoard {
  uri: string
  name: string
}

export const boardParts = (uri: string) => {
  const m = AT_COMMUNITY.exec(uri)
  return m ? { did: m[1], rkey: m[2] } : undefined
}
export const boardChannel = (uri: string) => {
  const p = boardParts(uri)
  return p ? channelId({ kind: 'board', ...p }) : undefined
}
export const boardPath = (uri: string) => {
  const p = boardParts(uri)
  return p ? `/c/${p.did}/${p.rkey}` : '/explore/boards'
}

export async function fetchBoard(did: string, rkey: string, sort = 'hot'): Promise<{ board: BoardView; stories: Story[] }> {
  const res = await fetch(`/api/feed?src=board&did=${encodeURIComponent(did)}&rkey=${encodeURIComponent(rkey)}&sort=${sort}`)
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'That board didn’t load')
  return (await res.json()) as { board: BoardView; stories: Story[] }
}

/** A board's own record, without its listings: it loads even while the board's moderation can't be read. */
async function fetchBoardInfo(did: string, rkey: string): Promise<BoardView> {
  const res = await fetch(`/api/feed?src=boardinfo&did=${encodeURIComponent(did)}&rkey=${encodeURIComponent(rkey)}`)
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'That board didn’t load')
  return (await res.json()) as BoardView
}

export const useBoard = (did: string | undefined, rkey: string | undefined) =>
  useQuery({ queryKey: keys.board(did, rkey), queryFn: () => fetchBoardInfo(did!, rkey!), enabled: !!did && !!rkey, staleTime: 60_000 })

export const useAllBoards = () =>
  useQuery({
    queryKey: keys.boards,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch('/api/feed?src=boards')
      return res.ok ? ((await res.json()) as BoardView[]) : []
    },
  })

export function toggleJoin(board: { uri: string; name: string }) {
  const { boards, set } = usePrefs.getState()
  set({ boards: boards.some((b) => b.uri === board.uri) ? boards.filter((b) => b.uri !== board.uri) : [...boards, { uri: board.uri, name: board.name }] })
}

/** Creates or updates a board in your own account. Returns its at:// URI. */
export async function saveBoard(qc: QueryClient, board: Omit<Board, 'createdAt'> & { createdAt?: string }, rkey = tid()): Promise<string> {
  if (!useAtproto.getState().did) throw new Error('Sign in with Bluesky to make a board (Settings, Sources)')
  const ref = await putRecord(BOARD_NSID, rkey, boardRecord(board))
  void qc.invalidateQueries({ queryKey: keys.anyBoard })
  void qc.invalidateQueries({ queryKey: keys.boards })
  return ref.uri
}

/** A Bluesky moderation list for keeping accounts out of a board, in your account. */
export async function createBlockList(boardName: string): Promise<string> {
  const ref = await createRecord('app.bsky.graph.list', {
    purpose: 'app.bsky.graph.defs#modlist',
    name: `Kept out of ${boardName}`.slice(0, 64),
    description: `Accounts kept out of the PaperWing board “${boardName}”.`.slice(0, 300),
    createdAt: new Date().toISOString(),
  })
  return ref.uri
}

/** A moderator hides a listing from the board. */
export async function hideFromBoard(qc: QueryClient, boardUri: string, postUri: string, reason?: string) {
  await createRecord(BOARD_HIDE_NSID, { board: boardUri, subject: postUri, ...(reason ? { reason } : {}), createdAt: new Date().toISOString() })
  void qc.invalidateQueries({ queryKey: keys.feeds })
}

/** The owner keeps an account out: it goes on the board's Bluesky moderation list. */
export async function keepOut(qc: QueryClient, list: string, did: string) {
  await createRecord('app.bsky.graph.listitem', { subject: did, list, createdAt: new Date().toISOString() })
  void qc.invalidateQueries({ queryKey: keys.feeds })
}

/** Resolves handles to DIDs through Bluesky's public API, for naming moderators. */
export async function resolveHandles(handles: string[]): Promise<string[]> {
  const out: string[] = []
  for (const h of handles.map((x) => x.trim().replace(/^@/, '')).filter(Boolean)) {
    if (/^did:/.test(h)) {
      out.push(h)
      continue
    }
    const res = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(h)}`)
    if (!res.ok) throw new Error(`Couldn’t find @${h} on Bluesky`)
    out.push(((await res.json()) as { did: string }).did)
  }
  return out
}

/** The board a feed is showing, for moderation actions in the reading pane. */
export const BoardContext = createContext<BoardView | undefined>(undefined)
export const useCurrentBoard = () => useContext(BoardContext)
