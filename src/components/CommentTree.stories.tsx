import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef } from 'react'
import { expect, fn, userEvent } from 'storybook/test'
import type { Comment } from '../lib/types'
import { comment, NOW, sampleComments } from '../test/fixtures'
import { CommentTree, Spine } from './CommentTree'

/** The tree scrolls inside the reading pane; this stands in for it. */
function Pane({ children }: { children: (ref: React.RefObject<HTMLDivElement | null>) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} style={{ maxWidth: 720, height: '100vh', overflow: 'auto', padding: '0 16px' }}>
      {children(ref)}
    </div>
  )
}

/** A long thread: forty top-level comments, some with replies, for the "show more" budget. */
const longThread = (): Comment[] =>
  Array.from({ length: 40 }, (_, i) =>
    comment({
      author: `reader${i}`,
      html: `<p>Comment number ${i + 1}: blogs, feeds and links are still how the good stuff spreads.</p>`,
      createdAt: NOW - (i + 1) * 600_000,
      children: i % 3 ? [] : [comment({ author: `reply${i}` })],
    }),
  )

const meta = {
  title: 'Reading/CommentTree',
  component: CommentTree,
  args: { comments: sampleComments(), sourceName: 'Hacker News', now: NOW, op: 'anildash', scrollRef: { current: null } },
  render: (args) => <Pane>{(ref) => <CommentTree {...args} scrollRef={ref} />}</Pane>,
} satisfies Meta<typeof CommentTree>
export default meta
type Story = StoryObj<typeof meta>

export const Thread: Story = {}

/** Back for a second look: comments since the last visit are marked New. */
export const NewSinceLastVisit: Story = {
  args: { since: NOW - 45 * 60_000 },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText('New')).toHaveLength(2)
  },
}

export const Bluesky: Story = {
  args: {
    sourceName: 'Bluesky',
    op: undefined,
    comments: [
      comment({
        author: 'molly.wiki',
        html: '<p>Rereading this every year is a ritual at this point.</p>',
        score: 230,
        quote: { author: 'anildash.com', name: 'Anil Dash', html: '<p>The web we lost is the web we can rebuild.</p>' },
      }),
      comment({ author: 'pip.paperwing.io', html: '<p>Look at this owl.</p>', score: 12, media: [{ kind: 'image', thumb: '/icon-512.png', alt: 'Pip', aspect: 1 }] }),
      comment({ author: 'spoilers.example', html: '<p>The ending of the book is…</p>', folded: 'Spoiler (content warning from the author)' }),
    ],
  },
}

export const CollapseAThread: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/This is exactly it/)).toBeVisible()
    await userEvent.click(canvas.getAllByRole('button', { name: 'Collapse thread' })[0])
    await expect(canvas.queryByText(/This is exactly it/)).toBeNull()
    await expect(canvas.getByText('4 hidden')).toBeVisible()
  },
}

export const SortNewestFirst: Story = {
  play: async ({ canvas }) => {
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Sort comments' }), 'new')
    const authors = [...canvas.getAllByText(/^(tptacek|simonw|throwaway42)$/)].map((el) => el.textContent)
    await expect(authors).toEqual(['throwaway42', 'simonw', 'tptacek'])
  },
}

/** Signed in to Hacker News: reply and upvote on each comment. */
export const SignedInToHackerNews: Story = {
  args: { actions: { kind: 'hn', me: 'reader', reply: fn() } },
  parameters: { app: { hn: { user: 'reader', votes: {} } } },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getAllByRole('button', { name: 'Reply' })[0])
    await expect(args.actions!.reply).toHaveBeenCalled()
  },
}

export const LongThread: Story = { args: { comments: longThread(), op: undefined } }

/** The thread map beside the tree: a mark per root comment, new ones highlighted; tapping one scrolls to it. */
function WithMap(props: React.ComponentProps<typeof CommentTree>) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div ref={ref} style={{ flex: 1, overflow: 'auto', padding: '0 16px' }}>
        <CommentTree {...props} scrollRef={ref} />
      </div>
      <div style={{ width: 28 }}>
        <Spine comments={props.comments} since={props.since} scrollRef={ref} />
      </div>
    </div>
  )
}

export const ThreadMap: Story = {
  args: { since: NOW - 45 * 60_000, comments: longThread() },
  render: (args) => <WithMap {...args} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('navigation', { name: 'Thread map' })).toBeVisible()
  },
}
