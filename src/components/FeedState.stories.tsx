import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { FeedEmpty, FeedFailed } from './FeedState'

const meta = { title: 'Feed/FeedState', component: FeedFailed } satisfies Meta<typeof FeedFailed>
export default meta

const statuses = [
  { id: 'hn', label: 'Hacker News', error: 'Failed to fetch' },
  { id: 'q', label: 'Quanta', error: 'Bad gateway' },
]

/** Every source failed: one plain sentence and a way to try again; the details are there if wanted. */
export const Failed: StoryObj<typeof FeedFailed> = {
  args: { offline: false, statuses, onRetry: fn() },
  play: async ({ args, canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: /Try again/ }))
    await expect(args.onRetry).toHaveBeenCalled()
    await expect(c.getByText(/Failed to fetch/)).not.toBeVisible()
  },
}

export const Offline: StoryObj<typeof FeedFailed> = {
  args: { offline: true, statuses, onRetry: fn() },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('You’re offline')).toBeVisible()
  },
}

/** Sources answered with nothing: refresh, or a topic nearby. */
export const Empty: StoryObj<typeof FeedEmpty> = {
  render: (args) => <FeedEmpty {...args} />,
  args: { filtered: false, allRead: false, related: ['physics', 'space'], onClearFilter: fn(), onRefresh: fn() },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByRole('button', { name: /Refresh/ })).toBeVisible()
    await expect(c.getByRole('link', { name: /Physics/ })).toBeVisible()
  },
}

/** A filter left nothing: the way out is to clear it. */
export const NothingMatchesTheFilter: StoryObj<typeof FeedEmpty> = {
  render: (args) => <FeedEmpty {...args} />,
  args: { filtered: true, allRead: false, onClearFilter: fn(), onRefresh: fn() },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Show everything' }))
    await expect(args.onClearFilter).toHaveBeenCalled()
  },
}

export const AllCaughtUp: StoryObj<typeof FeedEmpty> = {
  render: (args) => <FeedEmpty {...args} />,
  args: { filtered: false, allRead: true, onClearFilter: fn(), onRefresh: fn() },
}
