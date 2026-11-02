import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'
import { channelFor, NOW, ranked, sampleStories, statusesFor, story } from '../test/fixtures'
import { ChannelBrief } from './ChannelBrief'

const space = channelFor('space')
const stories = [
  ...sampleStories(),
  ranked({
    key: 'hn-77',
    title: 'Starship completes its first orbital refuelling test',
    topics: ['space'],
    comments: 640,
    alsoOn: [story({ key: 'lm-77', source: 'lemmy', sourceLabel: 'c/space', comments: 88 }), story({ key: 'bs-77', source: 'bluesky', sourceLabel: 'Bluesky', comments: 51 })],
  }),
  ranked({
    key: 'rss-9',
    source: 'rss',
    sourceLabel: 'SpaceNews',
    site: 'spacenews.com',
    title: 'ESA picks three new science missions',
    topics: ['space', 'science'],
    createdAt: NOW - 5 * 3_600_000,
    heat: 0.4,
  }),
]

const meta = {
  title: 'Feed/ChannelBrief',
  component: ChannelBrief,
  args: { channel: space, stories, statuses: statusesFor(space), onOpen: fn(), now: NOW },
  globals: { viewport: { value: 'desktop', isRotated: false } },
} satisfies Meta<typeof ChannelBrief>
export default meta
type Story = StoryObj<typeof meta>

export const Briefing: Story = {}
export const TuningIn: Story = { args: { stories: [], statuses: statusesFor(space, { loading: 6 }) } }

export const OpensWhereTheConversationIs: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getAllByText(/Starship completes/)[0])
    await expect(args.onOpen).toHaveBeenCalledWith('hn-77')
  },
}
