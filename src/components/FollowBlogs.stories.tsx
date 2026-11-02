import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import type { FoundFeed } from '../lib/follow'
import { usePrefs } from '../lib/store'
import { story } from '../test/fixtures'
import { BlogSuggestions, FeedFinder, FeedRow, FollowSite } from './FollowBlogs'

const anil: FoundFeed = { url: 'https://anildash.com/feed.xml', title: 'Anil Dash', site: 'anildash.com', posts: 20, latest: Date.now() - 3 * 86_400_000 }
const robin: FoundFeed = { url: 'https://www.robinsloan.com/feed.xml', title: 'Robin Sloan', site: 'robinsloan.com', posts: 12 }

const meta = {
  title: 'Feed/FollowBlogs',
  component: FeedRow,
  args: { feed: anil },
  decorators: [(Story) => <div style={{ maxWidth: 520, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof FeedRow>
export default meta
type Story = StoryObj<typeof meta>

export const Row: Story = {}
export const RowAlreadyFollowed: Story = { parameters: { app: { prefs: { customFeeds: [{ url: anil.url, label: anil.title }] } } } }

export const FollowFromARow: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Follow' }))
    await expect(usePrefs.getState().customFeeds.map((f) => f.url)).toContain(anil.url)
    await expect(canvas.getByRole('button', { name: 'Following' })).toBeDisabled()
  },
}

/** In the reader, beside a story from a blog you don't get yet. */
export const FollowTheSite: Story = {
  render: () => <FollowSite story={story({ url: 'https://anildash.com/2012/12/13/the_web_we_lost/' })} />,
  parameters: { app: { queries: [[['discover', 'anildash.com'], [anil]]] } },
}

export const Finder: Story = {
  render: () => <FeedFinder />,
  parameters: { app: { fetch: { 'src=discover': [anil, robin] } } },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole('textbox', { name: 'Site to follow' }), 'anildash.com')
    await userEvent.click(canvas.getByRole('button', { name: 'Find' }))
    await expect(await canvas.findByText('Robin Sloan')).toBeVisible()
  },
}

export const FinderFindsNothing: Story = {
  render: () => <FeedFinder />,
  parameters: { app: { fetch: { 'src=discover': [] } } },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole('textbox', { name: 'Site to follow' }), 'example.org')
    await userEvent.click(canvas.getByRole('button', { name: 'Find' }))
    await expect(await canvas.findByText(/No feed found there/)).toBeVisible()
  },
}

export const SuggestionsEmpty: Story = { render: () => <BlogSuggestions /> }

export const Suggestions: Story = {
  render: () => <BlogSuggestions />,
  parameters: {
    app: {
      activity: { sites: { 'anildash.com': { keys: ['a', 'b', 'c', 'd'], last: Date.now() - 86_400_000, url: 'https://anildash.com/2012/12/13/the_web_we_lost/' } } },
      queries: [[['discover', 'anildash.com'], [anil]]],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/You’ve opened 4 posts from anildash.com/)).toBeVisible()
  },
}
