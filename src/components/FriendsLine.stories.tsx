import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Friend } from '../lib/friends'
import { linkId } from '../lib/sources/bluesky'
import { FRIENDS, READER, story } from '../test/fixtures'
import { FriendsLine } from './FriendsLine'

const s = story()
const friends = (list: Friend[]) => ({
  atproto: { did: READER.did, handle: READER.handle },
  queries: [[['friends', READER.did], { [linkId(s.url!)]: list }]],
})

const meta = {
  title: 'Feed/FriendsLine',
  component: FriendsLine,
  args: { story: s },
  parameters: { layout: 'centered', app: friends([{ handle: 'anildash.com', name: 'Anil Dash', how: 'posted' }]) },
} satisfies Meta<typeof FriendsLine>
export default meta
type Story = StoryObj<typeof meta>

export const OneShared: Story = {}
export const SeveralDiscussing: Story = {
  parameters: {
    app: friends([
      { handle: 'molly.wiki', name: 'Molly White', how: 'replied' },
      { handle: 'anildash.com', how: 'replied' },
      { handle: 'jay.bsky.team', name: 'Jay', how: 'replied' },
      { handle: 'pfrazee.com', how: 'replied' },
    ]),
  },
}
/** Signed out, or nobody you follow mentioned it: nothing shows. */
export const Nobody: Story = { parameters: { app: {} } }

/** Quotes, posts, replies and reposts: each face carries a mark for what that person did. */
export const Mixed: Story = { parameters: { app: friends(FRIENDS) } }
