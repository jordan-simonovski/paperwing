import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'
import { usePrefs } from '../lib/store'
import { FeedList } from './FeedList'

const meta = {
  title: 'Settings/FeedList',
  component: FeedList,
  parameters: {
    app: {
      prefs: {
        customFeeds: [
          { url: 'https://jvns.ca/atom.xml', label: 'Julia Evans', site: 'jvns.ca', folder: 'Engineering' },
          { url: 'https://loose.example/rss', label: 'Followed from a story', site: 'loose.example' },
          { url: 'https://sam.example/rss', label: 'Sam', site: 'sam.example', folder: 'Friends' },
          { url: 'https://danluu.com/atom.xml', label: 'Dan Luu', site: 'danluu.com', folder: 'Engineering' },
        ],
      },
    },
  },
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof FeedList>
export default meta
type Story = StoryObj<typeof meta>

/** Feeds from another reader keep their folders; ones followed here come first. */
export const InFolders: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Engineering', 'Friends'])
    const engineering = canvas.getByRole('list', { name: 'Engineering' })
    await expect(engineering).toHaveTextContent('Julia Evans')
    await expect(engineering).toHaveTextContent('Dan Luu')
    await userEvent.click(canvas.getByRole('button', { name: 'Remove Sam' }))
    await waitFor(() => expect(canvas.queryByRole('heading', { name: 'Friends' })).toBeNull())
    await expect(usePrefs.getState().customFeeds).toHaveLength(3)
  },
}

export const NoFolders: Story = {
  parameters: { app: { prefs: { customFeeds: [{ url: 'https://loose.example/rss', label: 'A blog', site: 'loose.example' }] } } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('heading')).toBeNull()
  },
}
