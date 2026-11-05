import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'
import { linkId } from '../lib/sources/bluesky'
import { FRIENDS, FRIEND_QUOTE, READER, story } from '../test/fixtures'
import { FriendsList } from './FriendsList'

const s = story()

const meta = {
  title: 'Reading/FriendsList',
  component: FriendsList,
  args: { story: s, onOpen: fn() },
  parameters: { app: { atproto: { did: READER.did, handle: READER.handle }, queries: [[['friends', READER.did], { [linkId(s.url!)]: FRIENDS }]] } },
  decorators: [(Story) => <div style={{ maxWidth: 520, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof FriendsList>
export default meta
type Story = StoryObj<typeof meta>

/** In the reader it opens into who did what; a quote opens that post, a repost isn't anyone's to answer. */
export const Opened: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Rich Burroughs, Ian Coldwater and 3 more you follow quoted, shared, discussed and reposted this/ }))
    await userEvent.click(await canvas.findByRole('button', { name: /Rich Burroughs quoted it/ }))
    await expect(args.onOpen).toHaveBeenCalledWith(FRIEND_QUOTE)
    for (const repost of canvas.getAllByText('reposted it', { selector: 'span' })) await expect(repost.closest('button')).toBeNull()
  },
}
