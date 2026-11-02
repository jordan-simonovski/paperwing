import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor } from 'storybook/test'
import type { BoardView } from '../lib/boards'
import { BoardPicker } from './BoardPicker'

const OWNER = 'did:plc:paperwingownerabcdefghij'
const ME = 'did:plc:readerreaderreaderreader'
const RKEY = 'bbbbbbbbbbbbb'
const uri = `at://${OWNER}/io.paperwing.board/${RKEY}`
const board: BoardView = {
  uri,
  owner: OWNER,
  ownerHandle: 'paperwing.io',
  name: 'The Open Web',
  description: 'Independent blogs, open protocols, RSS and the people building a web that belongs to everyone.',
  topic: 'web',
  moderators: [],
  moderatorHandles: {},
  createdAt: '2026-10-01T00:00:00.000Z',
}
const joined = { prefs: { boards: [{ uri, name: board.name }] }, atproto: { did: ME, handle: 'reader.example' } }

/** The picker holding its own choice, as a sheet would. */
function Picker({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  const [front, setFront] = useState(false)
  return (
    <div className="max-w-md p-4">
      <BoardPicker board={value} onBoard={setValue} front={front} onFront={setFront} />
    </div>
  )
}

const meta = {
  title: 'Writing/BoardPicker',
  component: Picker,
  args: { initial: '' },
} satisfies Meta<typeof Picker>
export default meta
type Story = StoryObj<typeof meta>

/** No board: just PaperWing's front page. Topic boards are always there. */
export const FrontPage: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('combobox', { name: 'Board' })).toHaveValue('')
    await expect(canvas.queryByRole('checkbox')).toBeNull()
  },
}

/** A community board you’ve joined: its posts stay on it unless you tick the front page too. */
export const CommunityBoard: Story = {
  args: { initial: uri },
  parameters: { app: { ...joined, queries: [[['board', OWNER, RKEY], board]] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('combobox', { name: 'Board' })).toHaveValue(uri)
    await waitFor(() => expect(canvas.getByRole('checkbox', { name: 'Also on PaperWing’s front page' })).not.toBeChecked())
  },
}

/** A moderators-only board: it says so, and there’s no front-page tick to give. */
export const ModeratorsOnly: Story = {
  args: { initial: uri },
  parameters: { app: { ...joined, queries: [[['board', OWNER, RKEY], { ...board, modsOnly: true }]] } },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('Only its moderators post on The Open Web.')).toBeVisible())
    await expect(canvas.queryByRole('checkbox')).toBeNull()
  },
}
