import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import { usePrefs } from '../lib/store'
import { Blogroll } from './Blogroll'

const feeds = [
  { url: 'https://anildash.com/feed.xml', label: 'Anil Dash', site: 'anildash.com' },
  { url: 'https://www.robinsloan.com/feed.xml', label: 'Robin Sloan', site: 'robinsloan.com' },
  { url: 'https://simonwillison.net/atom/everything/', label: 'Simon Willison', site: 'simonwillison.net' },
]

const meta = {
  title: 'Feed/Blogroll',
  component: Blogroll,
  args: { feeds, who: '@paperwing.io', mine: false },
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof Blogroll>
export default meta
type Story = StoryObj<typeof meta>

export const Collapsed: Story = {}
export const Yours: Story = { args: { mine: true } }

export const FollowAll: Story = {
  parameters: { app: { prefs: { customFeeds: [{ url: feeds[0].url, label: feeds[0].label }] } } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { expanded: false }))
    await userEvent.click(canvas.getByRole('button', { name: /Follow all 2/ }))
    await expect(usePrefs.getState().customFeeds.map((f) => f.url)).toEqual(feeds.map((f) => f.url))
  },
}
