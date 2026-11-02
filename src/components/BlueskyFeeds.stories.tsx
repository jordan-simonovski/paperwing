import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'
import { usePrefs } from '../lib/store'
import { BlueskyFeeds } from './BlueskyFeeds'

const DID = 'did:plc:feedcreatorexampleabcdef'

const meta = {
  title: 'Settings/BlueskyFeeds',
  component: BlueskyFeeds,
  parameters: {
    app: {
      prefs: {
        bskyFeeds: [
          { uri: `at://${DID}/app.bsky.feed.generator/science`, name: 'Science' },
          { uri: `at://${DID}/app.bsky.graph.list/3kjournos`, name: 'Journalists' },
        ],
      },
    },
  },
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof BlueskyFeeds>
export default meta
type Story = StoryObj<typeof meta>

export const FeedsAndLists: Story = {}
export const None: Story = { parameters: { app: { prefs: { bskyFeeds: [] } } } }

export const AddAFeed: Story = {
  parameters: { app: { prefs: { bskyFeeds: [] }, fetch: { getFeedGenerator: { view: { displayName: 'Quiet Posters' } } } } },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole('textbox'), `https://bsky.app/profile/${DID}/feed/quiet`)
    await userEvent.click(canvas.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(usePrefs.getState().bskyFeeds).toEqual([{ uri: `at://${DID}/app.bsky.feed.generator/quiet`, name: 'Quiet Posters' }]))
  },
}

export const Remove: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Remove Journalists' }))
    await expect(usePrefs.getState().bskyFeeds.map((f) => f.name)).toEqual(['Science'])
  },
}
