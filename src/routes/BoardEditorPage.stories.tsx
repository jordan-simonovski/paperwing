import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import type { BoardView } from '../lib/boards'
import { BoardEditorPage } from './BoardEditorPage'

const OWNER = 'did:plc:paperwingownerabcdefghij'
const RKEY = 'bbbbbbbbbbbbb'
const board: BoardView = {
  uri: `at://${OWNER}/io.paperwing.board/${RKEY}`,
  owner: OWNER,
  ownerHandle: 'paperwing.io',
  name: 'The Open Web',
  description: 'Independent blogs, open protocols, RSS and the people building a web that belongs to everyone.',
  rules: 'Link to the source, not a summary of it.',
  topic: 'web',
  moderators: [OWNER],
  moderatorHandles: {},
  createdAt: '2026-10-01T00:00:00.000Z',
}
const signedIn = { did: OWNER, handle: 'paperwing.io' }
const editing = { path: '/boards/:rkey?', url: `/boards/${RKEY}` }

const meta = {
  title: 'Pages/BoardEditor',
  component: BoardEditorPage,
  parameters: { app: { atproto: signedIn, route: { path: '/boards/:rkey?', url: '/boards' } } },
} satisfies Meta<typeof BoardEditorPage>
export default meta
type Story = StoryObj<typeof meta>

export const NewBoard: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Start a board' })).toBeVisible()
  },
}

/** Editing your board: the form starts from what it says now. */
export const EditBoard: Story = {
  parameters: { app: { atproto: signedIn, route: editing, fetch: { '/api/feed?src=boardinfo': board } } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'Edit your board' })).toBeVisible()
    await expect(canvas.getByRole('textbox', { name: 'Name' })).toHaveValue('The Open Web')
  },
}

/** The board didn't load: no blank form, which would save over it as a new board. */
export const EditBoardDidntLoad: Story = {
  parameters: { app: { atproto: signedIn, route: editing } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(canvas.queryByRole('textbox', { name: 'Name' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Start the board' })).toBeNull()
  },
}

/** The board's moderation can't be read (so its listings won't load), but its owner can still edit it. */
export const EditWhileModerationIsDown: Story = {
  parameters: { app: { atproto: signedIn, route: editing, fetch: { '/api/feed?src=boardinfo': board } } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'Edit your board' })).toBeVisible()
    await expect(canvas.getByRole('textbox', { name: 'Name' })).toHaveValue('The Open Web')
  },
}

/** An official board only takes posts from its moderators: the choice is made for it. */
export const OfficialBoard: Story = {
  parameters: { app: { atproto: signedIn, route: editing, fetch: { '/api/feed?src=boardinfo': { ...board, official: true } } } },
  play: async ({ canvas }) => {
    const only = await canvas.findByRole('checkbox', { name: /Only moderators post here/ })
    await expect(only).toBeChecked()
    await expect(only).toBeDisabled()
  },
}

/** Any board can choose it. */
export const ModeratorsOnly: Story = {
  parameters: { app: { atproto: signedIn, route: editing, fetch: { '/api/feed?src=boardinfo': board } } },
  play: async ({ canvas }) => {
    const only = await canvas.findByRole('checkbox', { name: /Only moderators post here/ })
    await expect(only).not.toBeChecked()
    await userEvent.click(only)
    await expect(only).toBeChecked()
  },
}
