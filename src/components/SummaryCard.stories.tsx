import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import type { CachedSummary } from '../lib/summaryCache'
import { NOW, story } from '../test/fixtures'
import { SummaryCard } from './SummaryCard'

const hn = story({ comments: 187 })
const lemmy = story({ key: 'lm-77', source: 'lemmy', sourceLabel: 'c/technology', comments: 64, discussionUrl: 'https://lemmy.world/post/77' })

const summary: CachedSummary = {
  key: hn.key,
  model: 'claude',
  summary: {
    gist: 'Most readers agree the 2012 essay aged well: the tools that let people publish and find each other directly were traded for reach, and the question now is whether open protocols can win them back.',
    themes: [
      { title: 'Shared items were the social network', summary: 'Several people credit Google Reader’s shared items with how they found writers they still read.', comments: ['c1', 'c2'] },
      { title: 'Blogrolls as human recommendations', summary: 'Before algorithms, the list of blogs someone read was the recommendation engine.', comments: ['c3'] },
    ],
    disagreements: [
      {
        question: 'Was the old web actually better for most people?',
        sides: [
          { view: 'Yes: it was slower and smaller, but nobody was optimising for anger.', comments: ['c2'] },
          { view: 'No: discovery was terrible and most people never found any of it.', comments: ['c4'] },
        ],
      },
    ],
    standouts: [{ comment: 'c1', why: 'A concise history of what RSS readers did socially.' }],
    contrast: 'Lemmy is warmer about rebuilding it; Hacker News is more sceptical that anyone will come back.',
  },
  refs: [
    ['c1', { threadKey: hn.key, commentId: 'c1', author: 'tptacek' }],
    ['c2', { threadKey: hn.key, commentId: 'c2', author: 'anildash' }],
    ['c3', { threadKey: lemmy.key, commentId: 'c3', author: 'jacquesm' }],
    ['c4', { threadKey: hn.key, commentId: 'c4', author: 'throwaway42' }],
  ],
  sent: 120,
  total: 251,
  comments: 251,
  places: ['Hacker News', 'c/technology'],
  at: NOW - 3_600_000,
  updatedAt: NOW - 3_600_000,
}

const meta = {
  title: 'Reading/SummaryCard',
  component: SummaryCard,
  args: { story: hn, places: [hn, lemmy], onOpen: fn() },
  parameters: { app: { fetch: { '/api/summarize?status': { server: true } } } },
  decorators: [(Story) => <div style={{ maxWidth: 720, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof SummaryCard>
export default meta
type Story = StoryObj<typeof meta>

/** Enough comments to be worth it, no summary yet: offer one. */
export const Offer: Story = {
  parameters: { app: { fetch: { '/api/summarize?status': { server: true } }, summaries: { items: { [hn.key]: null } } } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('button', { name: /Summarize/ })).toBeVisible()
  },
}

export const Summarized: Story = {
  parameters: { app: { summaries: { items: { [hn.key]: summary } } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Where they disagree')).toBeVisible()
    await expect(canvas.getByRole('button', { name: /Redo/ })).toBeVisible()
  },
}

/** The discussion has grown a lot since: offer to update. */
export const OutOfDate: Story = {
  args: {
    places: [
      { ...hn, comments: 420 },
      { ...lemmy, comments: 120 },
    ],
  },
  parameters: { app: { summaries: { items: { [hn.key]: summary } } } },
}

/** Fewer than ten comments: not worth a summary, nothing shows. */
export const TooQuiet: Story = {
  args: { places: [{ ...hn, comments: 4 }] },
  parameters: { app: { summaries: { items: { [hn.key]: null } } } },
}
