import type { Meta, StoryObj } from '@storybook/react-vite'
import { linkId } from '../lib/sources/bluesky'
import { READER, story } from '../test/fixtures'
import { FriendsLine } from './FriendsLine'

const s = story()
const friends = (list: { handle: string; name?: string; how: 'shared' | 'replied' }[]) => ({
  atproto: { did: READER.did, handle: READER.handle },
  queries: [[['friends', READER.did], { [linkId(s.url!)]: list }]],
})

const meta = {
  title: 'Feed/FriendsLine',
  component: FriendsLine,
  args: { story: s },
  parameters: { layout: 'centered', app: friends([{ handle: 'anildash.com', name: 'Anil Dash', how: 'shared' }]) },
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
