import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'
import { MAX_FEEDS } from '../lib/publishers'
import { usePrefs } from '../lib/store'
import { useUI } from '../lib/ui'
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

const followed = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://blog${i}.example/feed`, label: `Blog ${i}` }))

/** With room for one more, Follow all follows what fits and says how many it left out. */
export const FollowAllNearlyFull: Story = {
  parameters: { app: { prefs: { customFeeds: followed(MAX_FEEDS - 1) } } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { expanded: false }))
    await userEvent.click(canvas.getByRole('button', { name: /Follow all 3/ }))
    await expect(usePrefs.getState().customFeeds).toHaveLength(MAX_FEEDS)
    await waitFor(() => expect(useUI.getState().toasts.at(-1)?.message).toMatch(/2 left out: your feeds are full/))
  },
}

/** With your feeds full, Follow all follows nothing and says why. */
export const FollowAllWhenFull: Story = {
  parameters: { app: { prefs: { customFeeds: followed(MAX_FEEDS) } } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { expanded: false }))
    await userEvent.click(canvas.getByRole('button', { name: /Follow all 3/ }))
    await expect(usePrefs.getState().customFeeds).toHaveLength(MAX_FEEDS)
    await waitFor(() => expect(useUI.getState().toasts.at(-1)?.message).toMatch(/Your feeds are full/))
  },
}

export const NativePublication: Story = {
  args: { feeds: [{ url: 'https://lab.leaflet.pub', label: 'Leaflet Lab Notes', site: 'lab.leaflet.pub', format: 'standard' }] },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { expanded: false }))
    await userEvent.click(canvas.getByRole('button', { name: 'Follow' }))
    await expect(usePrefs.getState().customFeeds[0]).toMatchObject({ url: 'https://lab.leaflet.pub', format: 'standard' })
  },
}
