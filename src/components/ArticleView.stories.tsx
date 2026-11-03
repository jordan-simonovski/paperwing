import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'
import { usePrefs } from '../lib/store'
import type { Article } from '../lib/types'
import { story } from '../test/fixtures'
import { ArticleView, TextSizeControl } from './ArticleView'

const s = story()
const article: Article = {
  url: s.url!,
  title: 'The Web We Lost',
  byline: 'Anil Dash',
  siteName: 'anildash.com',
  length: 7400,
  html: [
    '<p>The tech industry and its press have treated the rise of billion-scale social networks and ubiquitous smartphone apps as an unadulterated win for regular people, a triumph of usability and empowerment.</p>',
    '<p>They seldom talk about what we’ve lost along the way in this transition, and I find that younger folks may not even know how the web used to be.</p>',
    '<h2>What we lost</h2>',
    '<p>Ten years ago, you could allow people to post links on your site, and they would just show up. If you posted something, people could link to it from their own sites, and you’d see it.</p>',
    '<blockquote><p>We’ve abandoned core values that used to be fundamental to the web world.</p></blockquote>',
    '<p>Five years ago, if you wanted to show content from one site or app on your own site or app, you could use a simple, documented format to do so, without requiring a business-development deal.</p>',
  ].join(''),
}

const meta = {
  title: 'Reading/ArticleView',
  component: ArticleView,
  args: { story: s },
  parameters: {
    app: {
      queries: [
        [['article', s.url], article],
        [['notes', s.url], []],
      ],
    },
  },
} satisfies Meta<typeof ArticleView>
export default meta
type Story = StoryObj<typeof meta>

export const ReaderView: Story = {}

/** The extractor failed (blocked, a PDF, client-rendered): offer the original. */
export const NoReaderView: Story = {
  args: { story: story({ url: 'https://example.com/blocked' }) },
  parameters: { app: { queries: [], fetch: {} } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('No reader view for this one', {}, { timeout: 5000 })).toBeVisible()
    await expect(canvas.getByRole('link', { name: /Open original/ })).toHaveAttribute('href', 'https://example.com/blocked')
  },
}

/** The article can't be read here but people are talking about it: the discussion comes first. */
export const NoReaderViewWithDiscussion: Story = {
  args: { story: story({ url: 'https://example.com/blocked', comments: 18 }), onDiscussion: fn() },
  parameters: { app: { queries: [], fetch: {} } },
  play: async ({ args, canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /Read the discussion/ }, { timeout: 5000 }))
    await expect(args.onDiscussion).toHaveBeenCalled()
  },
}

/** A post with no link: its own words, and the post it quotes. */
export const SelfPost: Story = {
  args: {
    story: story({
      source: 'bluesky',
      url: null,
      text: '<p>Every topic, board, mix and profile on PaperWing now has its own RSS feed. Bring your reader.</p>',
      quote: { author: 'anildash.com', name: 'Anil Dash', html: '<p>The web we lost is the web we can rebuild.</p>' },
    }),
  },
}

export const NoBody: Story = { args: { story: story({ source: 'bluesky', url: null }) } }

export const TextSizeButtons: Story = {
  render: () => <TextSizeControl />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Larger text' }))
    await expect(usePrefs.getState().textSize).toBe('lg')
    await expect(canvas.getByRole('button', { name: 'Larger text' })).toBeDisabled()
  },
}
