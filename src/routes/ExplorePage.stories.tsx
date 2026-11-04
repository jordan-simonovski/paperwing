import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { keys } from '../lib/query'
import { bskyFeedChannel } from '../lib/channels'
import { usePrefs } from '../lib/store'
import { ExplorePage } from './ExplorePage'

const feed = { uri: 'at://did:plc:feedcreatorexampleabcdef/app.bsky.feed.generator/science', name: 'Science', by: 'science.example', likes: 42 }
const list = { uri: 'at://did:plc:feedcreatorexampleabcdef/app.bsky.graph.list/journalists', name: 'Journalists' }
const meta = {
  title: 'Pages/Explore',
  component: ExplorePage,
  parameters: { app: { route: { path: '/explore/:tab', url: '/explore/feeds' }, queries: [[keys.explore('bsky-feeds', ''), [feed]]] } },
} satisfies Meta<typeof ExplorePage>
export default meta
type Story = StoryObj<typeof meta>

export const AddAndOpenFeed: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Add Science' }))
    const yours = within(canvas.getByRole('region', { name: 'Your feeds' }))
    await expect(yours.getByRole('link', { name: 'Open Science' })).toHaveAttribute('href', `/t/${bskyFeedChannel(feed.uri)}`)
    await expect(canvas.queryByRole('button', { name: 'Added' })).toBeNull()
  },
}

export const ExistingFeedsAndLists: Story = {
  parameters: { app: { prefs: { bskyFeeds: [feed, list] }, queries: [[keys.explore('bsky-feeds', ''), []]] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Open Journalists' })).toHaveAttribute('href', `/t/${bskyFeedChannel(list.uri)}`)
    await userEvent.click(canvas.getByRole('button', { name: 'Remove Science' }))
    await expect(canvas.queryByRole('link', { name: 'Open Science' })).toBeNull()
    await expect(usePrefs.getState().bskyFeeds).toEqual([list])
  },
}

export const FeedsOnAPhone: Story = {
  ...ExistingFeedsAndLists,
  globals: { viewport: { value: 'mobile2', isRotated: false } },
}

export const SavedFeedsWhenDiscoveryFails: Story = {
  parameters: { app: { prefs: { bskyFeeds: [feed] }, queries: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Open Science' })).toBeVisible()
    await expect(await canvas.findByText(/Couldn’t reach Bluesky/)).toBeVisible()
  },
}

export const Mixes: Story = {
  parameters: {
    app: { route: { path: '/explore/:tab', url: '/explore/mixes' }, prefs: { mixes: [{ id: 'morning', name: 'Morning reading', sources: [{ kind: 'topic', id: 'science' }], updatedAt: 1 }] } },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Open Morning reading' })).toHaveAttribute('href', '/t/mix:morning')
    await expect(canvas.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/mixes/morning')
  },
}

export const YourPublishers: Story = {
  parameters: { app: { route: { path: '/explore/:tab', url: '/explore/publishers' }, prefs: { customFeeds: [{ url: 'https://lab.leaflet.pub', label: 'Leaflet Lab Notes', format: 'standard' }] } } },
  play: async ({ canvas }) => {
    const yours = within(canvas.getByRole('region', { name: 'Your publishers' }))
    await expect(yours.getByRole('link', { name: 'Open Leaflet Lab Notes' })).toHaveAttribute('href', `/t/${encodeURIComponent('feed:https://lab.leaflet.pub')}`)
  },
}

export const Communities: Story = {
  parameters: {
    app: {
      route: { path: '/explore/:tab', url: '/explore/communities' },
      queries: [[keys.explore('communities', ''), [{ name: 'science@lemmy.world', title: 'Science', subscribers: 42, active: 12 }]]],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Open Science' })).toHaveAttribute('href', '/t/c:science@lemmy.world')
    await userEvent.click(canvas.getByRole('button', { name: /^Join$/ }))
    await expect(canvas.getByRole('link', { name: 'Open Science' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Joined' })).toHaveAttribute('aria-pressed', 'true')
  },
}
