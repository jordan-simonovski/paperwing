import { useQuery, type QueryClient } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import { createRecord, putRecord, useAtproto } from './atproto'
import { tid } from './mixes'
import { boardParts } from './paperwing'
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
  /** Run by PaperWing itself: decided by the server from who owns the board, never by the board. */
  official?: boolean
  /** Listings in the last week (on the board list). */
  active?: number
}

/** A board you've joined: it gets a channel and shows in the menu. */
export interface JoinedBoard {
  uri: string
  name: string
}

export { boardParts }
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
  // Two minutes: as long as the edge may serve a board from before its owner's last change.
  useQuery({ queryKey: keys.board(did, rkey), queryFn: () => fetchBoardInfo(did!, rkey!), enabled: !!did && !!rkey, staleTime: 2 * 60_000 })

export const useAllBoards = () => useAllBoardsWhen(true)

/** Every board, asked for only when `enabled` (a topic page has boards; most pages don't need them). */
export const useAllBoardsWhen = (enabled: boolean) =>
  useQuery({
    queryKey: keys.boards,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch('/api/feed?src=boards')
      // A failed read keeps the list already on screen rather than emptying it.
      if (!res.ok) throw new Error('The boards didn’t load')
      return (await res.json()) as BoardView[]
    },
  })

export function toggleJoin(board: { uri: string; name: string }) {
  const { boards, set } = usePrefs.getState()
  set({ boards: boards.some((b) => b.uri === board.uri) ? boards.filter((b) => b.uri !== board.uri) : [...boards, { uri: board.uri, name: board.name }] })
}

/**
 * Creates or updates a board in your own account. Returns its at:// URI. `handles` names its
 * moderators (DID to handle) where they're known, so they show by name straight away.
 */
export async function saveBoard(qc: QueryClient, board: Omit<Board, 'createdAt'> & { createdAt?: string }, rkey = tid(), handles: Record<string, string> = {}): Promise<string> {
  if (!useAtproto.getState().did) throw new Error('Sign in with Bluesky to make a board (Settings, Sources)')
  const record = boardRecord(board)
  const ref = await putRecord(BOARD_NSID, rkey, record)
  // The board list and the board's own details take a minute or two to catch up (the open
  // network's index, then the edge's cache), and asking now would bring back what was there
  // before. Put the saved board in both ourselves, keeping what only the server knows, and stop
  // any read already on its way from landing on top.
  const { did, handle } = useAtproto.getState()
  await Promise.all([qc.cancelQueries({ queryKey: keys.board(did!, rkey) }), qc.cancelQueries({ queryKey: keys.boards })])
  const viewOf = (old: BoardView | undefined): BoardView => {
    const named = { ...old?.moderatorHandles, ...handles }
    return {
      ...old,
      // Every field the board has, from what was saved: a cleared one is gone, not left as it was.
      name: record.name,
      description: record.description,
      rules: record.rules,
      topic: record.topic,
      moderators: record.moderators,
      blockList: record.blockList,
      modsOnly: record.modsOnly,
      createdAt: record.createdAt,
      uri: ref.uri,
      owner: did!,
      ownerHandle: handle ?? old?.ownerHandle,
      moderatorHandles: Object.fromEntries(record.moderators.flatMap((m) => (named[m] ? [[m, named[m]]] : []))),
    }
  }
  qc.setQueryData<BoardView>(keys.board(did!, rkey), (old) => viewOf(old))
  qc.setQueryData<BoardView[]>(keys.boards, (list) => {
    if (!list) return list
    const old = list.find((b) => b.uri === ref.uri)
    return old ? list.map((b) => (b === old ? viewOf(old) : b)) : [viewOf(undefined), ...list]
  })
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

/** Accounts by handle (or DID), in the order given, each with the handle it was found by: Bluesky's public API, for naming moderators. */
export async function resolveHandles(handles: string[]): Promise<{ did: string; handle?: string }[]> {
  const out: { did: string; handle?: string }[] = []
  for (const h of handles.map((x) => x.trim().replace(/^@/, '')).filter(Boolean)) {
    if (/^did:/.test(h)) {
      out.push({ did: h })
      continue
    }
    const res = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(h)}`)
    if (!res.ok) throw new Error(`Couldn’t find @${h} on Bluesky`)
    out.push({ did: ((await res.json()) as { did: string }).did, handle: h })
  }
  return out
}

/** The board a feed is showing, for moderation actions in the reading pane. */
export const BoardContext = createContext<BoardView | undefined>(undefined)
export const useCurrentBoard = () => useContext(BoardContext)
