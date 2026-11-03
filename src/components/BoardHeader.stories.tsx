import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import type { BoardView } from '../lib/boards'
import { usePrefs } from '../lib/store'
import { READER } from '../test/fixtures'
import { BoardHeader } from './BoardHeader'

const OWNER = 'did:plc:paperwingownerabcdefghij'
const MOD = 'did:plc:moderatorexampleabcdefgh'
const RKEY = 'bbbbbbbbbbbbb'
const uri = `at://${OWNER}/io.paperwing.board/${RKEY}`
const board: BoardView = {
  uri,
  owner: OWNER,
  ownerHandle: 'paperwing.io',
  name: 'The Open Web',
  description: 'Independent blogs, open protocols, RSS and the people building a web that belongs to everyone.',
  rules: 'Link to the source, not a summary of it.\nDisagree with ideas, not people.\nNo self-promotion more than once a week.',
  topic: 'web',
  moderators: [MOD],
  moderatorHandles: { [MOD]: 'molly.wiki' },
  createdAt: '2026-10-01T00:00:00.000Z',
}

const meta = {
  title: 'Feed/BoardHeader',
  component: BoardHeader,
  args: { did: OWNER, rkey: RKEY, uri },
  parameters: { app: { queries: [[['board', OWNER, RKEY], board]] } },
  decorators: [(Story) => <div style={{ maxWidth: 640 }}>{Story()}</div>],
} satisfies Meta<typeof BoardHeader>
export default meta
type Story = StoryObj<typeof meta>

export const Board: Story = {}
export const Joined: Story = { parameters: { app: { queries: [[['board', OWNER, RKEY], board]], prefs: { boards: [{ uri, name: board.name }] } } } }
/** Its owner gets a way to edit it. */
export const YourBoard: Story = { parameters: { app: { queries: [[['board', OWNER, RKEY], board]], atproto: { did: OWNER, handle: 'paperwing.io' } } } }
export const NoRulesOrTopic: Story = { parameters: { app: { queries: [[['board', OWNER, RKEY], { ...board, rules: undefined, topic: undefined, description: undefined }]] } } }
/** The board was deleted, or its owner's server is down. */
export const DidNotLoad: Story = {
  parameters: { app: { queries: [] } },
  args: { did: READER.did },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('This board didn’t load', {}, { timeout: 5000 })).toBeVisible()
    // Like every state that failed: a way on.
    await expect(canvas.getByRole('button', { name: /Try again/ })).toBeVisible()
  },
}

export const ReadTheRulesAndJoin: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Rules/ }))
    await expect(canvas.getByText(/Disagree with ideas/)).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: /Join/ }))
    await expect(usePrefs.getState().boards).toEqual([{ uri, name: 'The Open Web' }])
  },
}

/** PaperWing's own board says so: the server marks it from who owns it. */
export const OfficialBoard: Story = {
  parameters: { app: { queries: [[['board', OWNER, RKEY], { ...board, name: 'Announcements', official: true }]] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByLabelText('Official PaperWing board')).toBeVisible()
    await expect(canvas.getByText('Official')).toBeVisible()
    await expect(canvas.getByText(/Only its moderators post here/)).toBeVisible()
  },
}

/** On a board where only moderators post, a moderator still gets the ways to post. */
export const ModeratorsOnlyToAModerator: Story = {
  parameters: { app: { queries: [[['board', OWNER, RKEY], { ...board, modsOnly: true }]], atproto: { did: MOD, handle: 'molly.wiki' } } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('button', { name: 'Write a post' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Post a link' })).toBeVisible()
  },
}

/** A board that only calls itself official gets no badge. */
export const CallsItselfOfficial: Story = {
  parameters: { app: { queries: [[['board', OWNER, RKEY], { ...board, name: 'Official PaperWing Announcements', official: false }]] } },
  play: async ({ canvas }) => {
    await canvas.findByRole('heading', { name: 'Official PaperWing Announcements' })
    await expect(canvas.queryByLabelText('Official PaperWing board')).toBeNull()
  },
}
