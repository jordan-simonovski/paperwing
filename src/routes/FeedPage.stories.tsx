import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { FeedPage } from './FeedPage'

const url = 'https://reading.example/feed.xml?kind=news&lang=en'
const meta = {
  title: 'Pages/PublisherFeed',
  component: FeedPage,
  parameters: {
    app: {
      route: { path: '/t/:channel/:itemKey?', url: `/t/${encodeURIComponent(`feed:${url}`)}` },
      prefs: { customFeeds: [{ url, label: 'Reading notes' }] },
      feeds: { 'Reading notes': [] },
    },
  },
} satisfies Meta<typeof FeedPage>
export default meta
type Story = StoryObj<typeof meta>

export const Publisher: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'Reading notes' })).toBeVisible()
  },
}
