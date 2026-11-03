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
  parameters: { app: { queries: [[['discover', 'https://anildash.com/2012/12/13/the_web_we_lost/'], [anil]]] } },
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

export const StandardPublication: Story = {
  render: () => <FeedFinder />,
  parameters: { app: { fetch: { 'src=discover': [{ url: 'https://lab.leaflet.pub', title: 'Leaflet Lab Notes', site: 'lab.leaflet.pub', posts: 0, format: 'standard' }] } } },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole('textbox', { name: 'Site to follow' }), 'lab.leaflet.pub')
    await userEvent.click(canvas.getByRole('button', { name: 'Find' }))
    await expect(await canvas.findByText('Standard.site publication')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Follow' }))
    await expect(usePrefs.getState().customFeeds).toContainEqual({ url: 'https://lab.leaflet.pub', label: 'Leaflet Lab Notes', site: 'lab.leaflet.pub', format: 'standard' })
  },
}

/** Given a site (a link pasted into Find): it's looked up straight away, with no typing or Find press. */
export const LooksUpASiteItWasGiven: Story = {
  render: () => <FeedFinder initial="https://lab.leaflet.pub" />,
  parameters: { app: { fetch: { 'src=discover': [{ url: 'https://lab.leaflet.pub', title: 'Leaflet Lab Notes', site: 'lab.leaflet.pub', posts: 0, format: 'standard' }] } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Site to follow' })).toHaveValue('https://lab.leaflet.pub')
    await expect(await canvas.findByText('Standard.site publication')).toBeVisible()
  },
}

/** Given nothing, it waits to be asked. */
export const WaitsWithoutASite: Story = {
  render: () => <FeedFinder initial="" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Site to follow' })).toHaveValue('')
    await expect(canvas.queryByText(/Looking|No feed found/)).toBeNull()
  },
}

export const DiscourseCategory: Story = {
  args: { feed: { url: 'https://meta.discourse.org/c/support/6.rss', title: 'Discourse — Support', site: 'meta.discourse.org', posts: 20, format: 'discourse' } },
  parameters: { app: { prefs: { customFeeds: [{ url: 'https://meta.discourse.org/c/feature/2.rss', label: 'Discourse — Feature', format: 'discourse' }] } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Follow' })).toBeEnabled()
    await userEvent.click(canvas.getByRole('button', { name: 'Follow' }))
    await expect(usePrefs.getState().customFeeds).toHaveLength(2)
  },
}

export const TwoPublicationsOnOneSite: Story = {
  render: () => (
    <>
      <FollowSite story={story({ url: 'https://writer.example/journal-a/post' })} />
      <FollowSite story={story({ url: 'https://writer.example/journal-b/post' })} />
    </>
  ),
  parameters: {
    app: {
      fetch: {
        'url=https%3A%2F%2Fwriter.example%2Fjournal-a%2Fpost': [{ url: 'https://writer.example/journal-a', title: 'Journal A', site: 'writer.example', posts: 0, format: 'standard' }],
        'url=https%3A%2F%2Fwriter.example%2Fjournal-b%2Fpost': [{ url: 'https://writer.example/journal-b', title: 'Journal B', site: 'writer.example', posts: 0, format: 'standard' }],
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('button', { name: 'Follow Journal A' })).toBeVisible()
    await expect(await canvas.findByRole('button', { name: 'Follow Journal B' })).toBeVisible()
  },
}

export const SuggestionsEmpty: Story = { render: () => <BlogSuggestions /> }

export const Suggestions: Story = {
  render: () => <BlogSuggestions />,
  parameters: {
    app: {
      activity: { sites: { 'anildash.com': { keys: ['a', 'b', 'c', 'd'], last: Date.now() - 86_400_000, url: 'https://anildash.com/2012/12/13/the_web_we_lost/' } } },
      queries: [[['discover', 'https://anildash.com/2012/12/13/the_web_we_lost/'], [anil]]],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/You’ve opened 4 posts from anildash.com/)).toBeVisible()
  },
}
