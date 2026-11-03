import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

const DID = 'did:plc:ukwly4246zmbi537o4u36pff'
vi.mock('./atproto', () => ({
  useAtproto: { getState: () => ({ did: DID, handle: 'me.example' }) },
  putRecord: async (collection: string, rkey: string) => ({ uri: `at://${DID}/${collection}/${rkey}`, cid: 'bafy' }),
  createRecord: async () => ({ uri: '', cid: '' }),
}))

const { resolveHandles, saveBoard } = await import('./boards')
const { keys } = await import('./query')
type BoardView = import('./boards').BoardView

const theirs: BoardView = {
  uri: 'at://did:plc:someoneelse/io.paperwing.board/3m2abcdefghij',
  owner: 'did:plc:someoneelse',
  name: 'Tech Sydney',
  moderators: [],
  moderatorHandles: {},
  createdAt: '2026-11-02T19:36:50.097Z',
}

describe('saving a board', () => {
  it('puts a new board on the board list straight away, before the list catches up', async () => {
    const qc = new QueryClient()
    qc.setQueryData<BoardView[]>(keys.boards, [theirs])
    const uri = await saveBoard(qc, { name: 'Announcements', moderators: [], modsOnly: true }, '3m2bbbbbbbbbb')
    const list = qc.getQueryData<BoardView[]>(keys.boards)!
    expect(list.map((b) => b.name)).toEqual(['Announcements', 'Tech Sydney'])
    expect(list[0]).toMatchObject({ uri, owner: DID, ownerHandle: 'me.example', modsOnly: true })
    // Asking again now would only bring back the list from before it was made.
    expect(qc.getQueryState(keys.boards)?.isInvalidated).toBe(false)
  })

  it('updates a board already on the list in place, keeping what only the server knows', async () => {
    const qc = new QueryClient()
    const mine: BoardView = {
      uri: `at://${DID}/io.paperwing.board/3m2bbbbbbbbbb`,
      owner: DID,
      name: 'Old name',
      moderators: [],
      moderatorHandles: {},
      official: true,
      active: 3,
      createdAt: '2026-11-03T00:00:00.000Z',
    }
    qc.setQueryData<BoardView[]>(keys.boards, [theirs, mine])
    await saveBoard(qc, { name: 'New name', moderators: [], createdAt: mine.createdAt }, '3m2bbbbbbbbbb')
    expect(qc.getQueryData<BoardView[]>(keys.boards)).toEqual([theirs, expect.objectContaining({ name: 'New name', official: true, active: 3 })])
  })

  it('leaves the list alone when it hasn’t loaded yet', async () => {
    const qc = new QueryClient()
    await saveBoard(qc, { name: 'Announcements', moderators: [] }, '3m2bbbbbbbbbb')
    expect(qc.getQueryData(keys.boards)).toBeUndefined()
  })
})

describe('clearing a board’s details', () => {
  it('shows what was cleared as gone, not as it was before', async () => {
    const qc = new QueryClient()
    const rkey = '3m2bbbbbbbbbb'
    const before: BoardView = {
      uri: `at://${DID}/io.paperwing.board/${rkey}`,
      owner: DID,
      name: 'Kitchen',
      description: 'Old words',
      rules: 'Be kind',
      modsOnly: true,
      moderators: [],
      moderatorHandles: {},
      createdAt: '2026-11-03T00:00:00.000Z',
    }
    qc.setQueryData(keys.board(DID, rkey), before)
    qc.setQueryData<BoardView[]>(keys.boards, [before])
    await saveBoard(qc, { name: 'Kitchen', moderators: [], createdAt: before.createdAt }, rkey)
    for (const view of [qc.getQueryData<BoardView>(keys.board(DID, rkey))!, qc.getQueryData<BoardView[]>(keys.boards)![0]]) {
      expect(view.description).toBeUndefined()
      expect(view.rules).toBeUndefined()
      expect(view.modsOnly).toBeUndefined()
    }
  })
})

describe('editing a board’s moderators', () => {
  it('shows the new moderators on the board straight away, by name', async () => {
    const qc = new QueryClient()
    const rkey = '3m2bbbbbbbbbb'
    const before: BoardView = {
      uri: `at://${DID}/io.paperwing.board/${rkey}`,
      owner: DID,
      name: 'Announcements',
      moderators: [],
      moderatorHandles: {},
      official: true,
      createdAt: '2026-11-03T00:00:00.000Z',
    }
    qc.setQueryData(keys.board(DID, rkey), before)
    await saveBoard(qc, { name: 'Announcements', moderators: ['did:plc:molly'], createdAt: before.createdAt }, rkey, { 'did:plc:molly': 'molly.wiki' })
    expect(qc.getQueryData(keys.board(DID, rkey))).toMatchObject({ moderators: ['did:plc:molly'], moderatorHandles: { 'did:plc:molly': 'molly.wiki' }, official: true })
    // Asking again now could bring back the board as it was a minute ago.
    expect(qc.getQueryState(keys.board(DID, rkey))?.isInvalidated).toBe(false)
  })

  it('looks moderators up by handle, keeping each handle beside its account', async () => {
    vi.stubGlobal('fetch', async (url: string) => new Response(JSON.stringify({ did: url.includes('molly.wiki') ? 'did:plc:molly' : 'did:plc:sam' })))
    try {
      expect(await resolveHandles(['@molly.wiki', ' sam.example ', 'did:plc:direct', ''])).toEqual([
        { did: 'did:plc:molly', handle: 'molly.wiki' },
        { did: 'did:plc:sam', handle: 'sam.example' },
        { did: 'did:plc:direct' },
      ])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('joining a board says where it shows up, once', async () => {
  const { toggleJoin } = await import('./boards')
  const { usePrefs } = await import('./store')
  const { useUI } = await import('./ui')
  const board = { uri: `at://${DID}/io.paperwing.board/3kb`, name: 'Home Cooking' }
  const said = () => useUI.getState().toasts.map((t) => t.message)

  it('explains on the first join, and not on the next', () => {
    usePrefs.setState({ boards: [], firsts: [] })
    useUI.setState({ toasts: [] })
    toggleJoin(board)
    expect(said()).toEqual([expect.stringMatching(/^Joined Home Cooking\. It’s under Boards in your menu/)])
    toggleJoin(board)
    toggleJoin(board)
    expect(said()).toHaveLength(1)
  })

  it('leaves the explanation for later when the caller says its own thing (making a board)', () => {
    usePrefs.setState({ boards: [], firsts: [] })
    useUI.setState({ toasts: [] })
    toggleJoin(board, { explain: false })
    expect(said()).toEqual([])
    expect(usePrefs.getState().firsts).toEqual([])
  })
})
