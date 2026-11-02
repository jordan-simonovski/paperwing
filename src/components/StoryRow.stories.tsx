import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'
import { NOW, ranked, story } from '../test/fixtures'
import { RowSkeleton, StoryRow } from './StoryRow'

const meta = {
  title: 'Feed/StoryRow',
  component: StoryRow,
  args: { story: ranked(), selected: false, read: false, now: NOW, onOpen: fn() },
  decorators: [(Story) => <div style={{ maxWidth: 640 }}>{Story()}</div>],
} satisfies Meta<typeof StoryRow>
export default meta
type Story = StoryObj<typeof meta>

export const HackerNews: Story = {}

export const CrossPosted: Story = {
  args: {
    story: ranked({
      title: 'Bluesky passes 40 million users',
      alsoOn: [story({ source: 'lemmy', sourceLabel: 'c/technology', key: 'lm-9' }), story({ source: 'mastodon', sourceLabel: 'Mastodon', key: 'md-9' })],
      topics: ['social', 'web'],
    }),
  },
}

export const BlogWithExcerpt: Story = {
  args: {
    story: ranked({
      source: 'rss',
      sourceLabel: 'Quanta',
      site: 'quantamagazine.org',
      title: 'A New Proof Smooths Out the Math of Melting',
      discussionUrl: null,
      hasThread: false,
      score: undefined,
      comments: undefined,
      text: '<p>Mathematicians have long struggled to describe what happens at the boundary between ice and water.</p>',
      topics: ['science'],
    }),
  },
}

export const SharedWithANote: Story = {
  args: { story: ranked({ sharedBy: ['paperwing.io'], shareNote: 'Still the clearest case for why feeds, links and blogrolls mattered.' }) },
}

export const BehindAWarning: Story = {
  args: { story: ranked({ warning: 'Graphic media', media: [{ kind: 'image', thumb: '/icon-512.png' }] }) },
  parameters: { app: { prefs: { warnings: 'blur' } } },
}

export const Selected: Story = { args: { selected: true } }
export const Read: Story = { args: { read: true } }

export const OpensOnTap: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('link', { name: args.story.title }))
    await expect(args.onOpen).toHaveBeenCalledWith(args.story.key, 'article')
  },
}

export const UpvoteTeachesTheRanking: Story = {
  play: async ({ canvas }) => {
    const up = canvas.getByRole('button', { name: 'More like this' })
    await userEvent.click(up)
    await expect(up).toHaveAttribute('aria-pressed', 'true')
  },
}

/** While a feed loads. */
export const Skeleton: Story = { render: () => <RowSkeleton /> }

const BOARD = 'at://did:plc:uuuuuuuuuuuuuuuuuuuuuuuu/io.paperwing.board/3kitchenboard'
const NEWS = 'at://did:plc:eprq6bm2okrgk6zsoka2wpux/io.paperwing.board/3announcement'

/** A board's listing on the front page says which board it's from, with a way there. */
export const FromABoard: Story = {
  args: { story: ranked({ source: 'bluesky', sourceLabel: 'PaperWing', author: 'cook.example', board: { uri: BOARD, name: 'Home Cooking', official: false } }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'in Home Cooking' })).toHaveAttribute('href', '/c/did:plc:uuuuuuuuuuuuuuuuuuuuuuuu/3kitchenboard')
    await expect(canvas.queryByLabelText('Official PaperWing board')).toBeNull()
  },
}

/** PaperWing's own announcement: marked official, and pinned to the top of the front page. */
export const OfficialAnnouncement: Story = {
  args: {
    story: ranked({
      source: 'bluesky',
      sourceLabel: 'PaperWing',
      author: 'paperwing.io',
      board: { uri: NEWS, name: 'Announcements', official: true },
      pinned: true,
      title: 'Boards are here: find yours in Explore',
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Official PaperWing board')).toBeVisible()
    await expect(canvas.getByText('Pinned')).toBeVisible()
  },
}
