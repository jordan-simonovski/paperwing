import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'
import { indexStory } from '../lib/hooks'
import { NOW, story } from '../test/fixtures'
import { Elsewhere, RelatedView } from './RelatedView'

const s = story()
const lemmy = story({ key: 'lm-77', source: 'lemmy', sourceLabel: 'c/technology', comments: 64, score: 210, discussionUrl: 'https://lemmy.world/post/77' })
const oldHn = story({ key: 'hn-4955839', title: 'The Web We Lost (2012)', comments: 341, score: 980, createdAt: NOW - 400 * 24 * 3_600_000 })
const news = (key: string, site: string, title: string) =>
  story({ key, source: 'rss', sourceLabel: site, site, title, url: `https://${site}/${key}`, discussionUrl: null, hasThread: false, score: undefined, comments: undefined })
const coverage = [news('a1', 'theverge.com', 'The web we lost, and how to get it back'), news('a2', 'wired.com', 'Inside the fight to rebuild the open web')]

const meta = {
  title: 'Reading/RelatedView',
  component: RelatedView,
  args: { story: s, onOpen: fn(), now: NOW, alsoOn: [lemmy] },
  parameters: { app: { queries: [[['discussions', s.url], [oldHn]]] } },
  // "Similar stories you've loaded" reads what this session has seen.
  loaders: [
    () => {
      indexStory(story({ key: 'hn-sim-1', title: 'We lost the web we had: blogs, RSS and the indie web', comments: 58 }))
      indexStory(story({ key: 'hn-sim-2', title: 'Why the indie web lost to social networks', comments: 22 }))
      return {}
    },
  ],
} satisfies Meta<typeof RelatedView>
export default meta
type Story = StoryObj<typeof meta>

export const Related: Story = {}

export const WithCoverage: Story = { args: { coverage } }

export const TuneMore: Story = {
  play: async ({ canvas }) => {
    const more = canvas.getAllByRole('button', { name: 'More' })[0]
    await userEvent.click(more)
    await expect(canvas.getAllByText('showing more').length).toBeGreaterThan(0)
  },
}

export const DiscussedElsewhere: Story = {
  render: (args) => <Elsewhere {...args} />,
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: /The Web We Lost \(2012\)/ }))
    await expect(args.onOpen).toHaveBeenCalledWith('hn-4955839')
  },
}

export const NobodyElse: Story = {
  render: (args) => <Elsewhere {...args} alsoOn={[]} />,
  parameters: { app: { queries: [[['discussions', s.url], []]] } },
}
