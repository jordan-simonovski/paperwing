import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'
import { bskyKeyOf } from '../lib/bskyPost'
import { linkId } from '../lib/sources/bluesky'
import { READER, story } from '../test/fixtures'
import { DiscussionBar } from './DiscussionBar'

const hn = story({ comments: 187 })
const lemmy = story({ key: 'lm-77', source: 'lemmy', sourceLabel: 'c/technology', comments: 64, discussionUrl: 'https://lemmy.world/post/77' })
const lobsters = story({ key: 'lb-abc', source: 'lobsters', sourceLabel: 'Lobsters', comments: 31, discussionUrl: 'https://lobste.rs/s/abc' })
const bluesky = story({ key: 'bs-9', source: 'bluesky', sourceLabel: 'Bluesky', comments: 12, url: null, discussionUrl: 'https://bsky.app/profile/x/post/9' })

const meta = {
  title: 'Reading/DiscussionBar',
  component: DiscussionBar,
  args: { story: hn, alsoOn: [lemmy, lobsters], onOpen: fn() },
  // The extra places found by URL: seeded empty so the bar shows exactly what the story passes in.
  parameters: { app: { queries: [[['discussions', hn.url], []]] } },
  decorators: [(Story) => <div style={{ maxWidth: 640, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof DiscussionBar>
export default meta
type Story = StoryObj<typeof meta>

export const ThreePlaces: Story = {}

export const FoundByUrl: Story = { parameters: { app: { queries: [[['discussions', hn.url], [bluesky]]] } } }

export const WithCoverage: Story = { args: { alsoOn: [lemmy], coverage: [bluesky] } }

/** Only the story's own thread: no bar. */
export const OnePlace: Story = { args: { alsoOn: [] } }

export const SwitchesThread: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'c/technology, 64 comments' }))
    await expect(args.onOpen).toHaveBeenCalledWith('lm-77')
  },
}

/** Someone you follow quoted the link with words of their own: their conversation leads, under their name. */
export const FriendQuoted: Story = {
  parameters: {
    app: {
      atproto: { did: READER.did, handle: READER.handle },
      queries: [
        [['discussions', hn.url], []],
        [
          ['friends', READER.did],
          {
            [linkId(hn.url!)]: [
              {
                handle: 'richburroughs.dev',
                name: 'Rich Burroughs',
                how: 'quoted',
                post: bskyKeyOf('at://did:plc:rich/app.bsky.feed.post/3kq1'),
                text: 'The archive is the story.',
                likes: 41,
                replies: 9,
              },
            ],
          },
        ],
      ],
    },
  },
  play: async ({ canvas, args }) => {
    const first = (await canvas.findAllByRole('button', { name: /comments$|\d+$/ }))[0]
    await expect(first).toHaveAccessibleName('Rich Burroughs (quote), 9 comments')
    await userEvent.click(canvas.getByRole('button', { name: /^Rich Burroughs \(quote\) 9$/ }))
    await expect(args.onOpen).toHaveBeenCalledWith(bskyKeyOf('at://did:plc:rich/app.bsky.feed.post/3kq1'))
  },
}
