import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import type { Webmention } from '../lib/webmentions'
import { NOW } from '../test/fixtures'
import { WebMentions } from './WebMentions'

const URL = 'https://anildash.com/2012/12/13/the_web_we_lost/'
const mentions: Webmention[] = [
  {
    id: 1,
    kind: 'reply',
    author: 'Molly White',
    authorUrl: 'https://www.mollywhite.net/',
    url: 'https://www.mollywhite.net/micro/entry/1',
    text: 'Twelve years on, this reads less like nostalgia and more like a to-do list.',
    at: NOW - 3 * 3_600_000,
  },
  {
    id: 2,
    kind: 'mention',
    author: 'Simon Willison',
    photo: '/icon-192.png',
    url: 'https://simonwillison.net/2026/Nov/1/the-web-we-lost/',
    text: 'Linking this again because it keeps being right.',
    at: NOW - 26 * 3_600_000,
  },
  { id: 3, kind: 'like', author: 'Jeremy Keith', url: 'https://adactio.com/notes/1' },
  { id: 4, kind: 'repost', author: 'Tantek', url: 'https://tantek.com/1' },
]

const meta = {
  title: 'Reading/WebMentions',
  component: WebMentions,
  args: { url: URL, now: NOW },
  parameters: { app: { queries: [[['webmentions', URL], mentions]] } },
  decorators: [(Story) => <div style={{ maxWidth: 640, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof WebMentions>
export default meta
type Story = StoryObj<typeof meta>

export const Collapsed: Story = {}

export const Opened: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Around the web/ }))
    await expect(canvas.getByText(/reads less like nostalgia/)).toBeVisible()
    await expect(canvas.getAllByText('Read it on their site')).toHaveLength(2)
  },
}

/** Only likes and reposts: a count, with nothing to open. */
export const OnlyNods: Story = {
  parameters: { app: { queries: [[['webmentions', URL], mentions.slice(2)]] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /Around the web/ })).toBeDisabled()
  },
}

export const NoneYet: Story = { parameters: { app: { queries: [[['webmentions', URL], []]] } } }
