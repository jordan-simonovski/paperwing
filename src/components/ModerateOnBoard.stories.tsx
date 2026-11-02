import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { BoardContext, type BoardView } from '../lib/boards'
import { story } from '../test/fixtures'
import { ModerateOnBoard } from './ModerateOnBoard'

const OWNER = 'did:plc:ownerownerownerownerowne'
const MOD = 'did:plc:modmodmodmodmodmodmodmodm'
const board: BoardView = {
  uri: `at://${OWNER}/io.paperwing.board/3kboardboard2`,
  owner: OWNER,
  ownerHandle: 'paperwing.io',
  name: 'The Open Web',
  description: 'Independent blogs, open protocols, RSS and the people building a web that belongs to everyone.',
  moderators: [MOD],
  moderatorHandles: { [MOD]: 'moderator.example' },
  blockList: `at://${OWNER}/app.bsky.graph.list/3klist`,
  createdAt: '2026-10-01T00:00:00.000Z',
}
const listing = story({
  key: 'bs-listing',
  source: 'bluesky',
  sourceLabel: 'PaperWing',
  author: 'poster.example',
  authorDid: 'did:plc:posterposterposterposter',
  ref: { uri: 'at://did:plc:posterposterposterposter/app.bsky.feed.post/3kpost', cid: 'bafy' },
})

const meta = {
  title: 'Reading/ModerateOnBoard',
  component: ModerateOnBoard,
  args: { story: listing },
  decorators: [
    (Story) => (
      <BoardContext.Provider value={board}>
        <div className="flex gap-2" style={{ padding: 16 }}>
          {Story()}
        </div>
      </BoardContext.Provider>
    ),
  ],
} satisfies Meta<typeof ModerateOnBoard>
export default meta
type Story = StoryObj<typeof meta>

export const AsOwner: Story = {
  parameters: { app: { atproto: { did: OWNER, handle: 'paperwing.io' } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /Hide from board/ })).toBeVisible()
    await expect(canvas.getByRole('button', { name: /Keep out/ })).toBeVisible()
  },
}

export const AsModerator: Story = {
  parameters: { app: { atproto: { did: MOD, handle: 'moderator.example' } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /Hide from board/ })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /Keep out/ })).toBeNull()
  },
}

export const AsAnyoneElse: Story = {
  parameters: { app: { atproto: { did: 'did:plc:readerreaderreaderreader', handle: 'reader.example' } } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}
