import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'
import { topicFeeds } from '../lib/channels'
import { feedId } from '../lib/sources'
import { usePrefs } from '../lib/store'
import { TOPIC_BY_ID } from '../lib/topics'
import { story } from '../test/fixtures'

import { TopicCard } from './TopicCard'

const space = TOPIC_BY_ID.get('space')!

const meta = {
  title: 'Feed/TopicCard',
  component: TopicCard,
  args: { t: space },
  decorators: [(Story) => <div style={{ width: 320, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof TopicCard>
export default meta
type Story = StoryObj<typeof meta>

export const NotFollowed: Story = {}
export const Followed: Story = { parameters: { app: { prefs: { followed: ['space'] } } } }
export const Dimmed: Story = { args: { dim: true } }
export const Removable: Story = { args: { onRemove: fn() }, parameters: { app: { prefs: { followed: ['space'] } } } }

/** When one of its feeds is already on this device, the card shows what's leading the topic now. */
export const WithALeadStory: Story = {
  parameters: {
    app: {
      // The lead must be from the last day, measured against the real clock.
      queries: [[['feed', feedId(topicFeeds(space)[0])], [story({ title: 'Starship completes its first orbital refuelling test', createdAt: Date.now() - 2 * 3_600_000 })]]],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Starship completes/)).toBeVisible()
  },
}

export const FollowFromTheCard: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Follow Space' }))
    await expect(usePrefs.getState().followed).toContain('space')
    await expect(canvas.getByRole('button', { name: 'Following Space' })).toHaveAttribute('aria-pressed', 'true')
  },
}
