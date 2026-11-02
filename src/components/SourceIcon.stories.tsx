import type { Meta, StoryObj } from '@storybook/react-vite'
import type { SourceKind } from '../lib/types'
import { FeedIcon, PaperwingIcon, SourceIcon, StoryIcon } from './SourceIcon'

const KINDS: SourceKind[] = ['hn', 'lobsters', 'devto', 'hf', 'arxiv', 'github', 'release', 'bluesky', 'lemmy', 'mastodon', 'frontpage', 'status', 'rss']

const meta = {
  title: 'Brand/SourceIcon',
  component: SourceIcon,
  args: { source: 'hn', size: 24 },
  parameters: { layout: 'centered', app: { prefs: { seasonal: false } } },
} satisfies Meta<typeof SourceIcon>
export default meta
type Story = StoryObj<typeof meta>

export const Single: Story = {}

/** Every source, in brand colour and in ink. */
export const AllSources: Story = {
  render: ({ size }) => (
    <table className="text-[0.875rem]">
      <tbody>
        {KINDS.map((k) => (
          <tr key={k}>
            <td className="pr-4 text-ink-3">{k}</td>
            <td className="px-2">
              <SourceIcon source={k} size={size} />
            </td>
            <td className="px-2">
              <SourceIcon source={k} size={size} mono />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}

/** Blogs: a known brand gets its logo; anything else asks for the site's favicon, then falls back to the RSS glyph. */
export const Blogs: Story = {
  render: ({ size }) => (
    <div className="flex items-center gap-4">
      <SourceIcon source="rss" site="blog.cloudflare.com" size={size} />
      <SourceIcon source="rss" site="go.dev" size={size} />
      <SourceIcon source="rss" site="example.org" size={size} />
      <SourceIcon source="rss" size={size} />
    </div>
  ),
}

export const PaperWingListing: Story = {
  render: ({ size }) => (
    <div className="flex items-center gap-4">
      <StoryIcon story={{ source: 'bluesky', site: undefined, url: null, sourceLabel: 'PaperWing' }} size={size} />
      <PaperwingIcon size={size} />
    </div>
  ),
}

export const FeedIcons: Story = {
  render: ({ size }) => (
    <div className="flex items-center gap-4">
      <FeedIcon feed={{ kind: 'hn', list: 'top' }} size={size} />
      <FeedIcon feed={{ kind: 'paperwing', sort: 'hot' }} size={size} />
      <FeedIcon feed={{ kind: 'status' }} size={size} />
      <FeedIcon feed={{ kind: 'rss', url: 'https://go.dev/blog/feed.atom', label: 'The Go Blog' }} size={size} />
    </div>
  ),
}
