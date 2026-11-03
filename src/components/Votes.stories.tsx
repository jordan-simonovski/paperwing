import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import { useActivity } from '../lib/store'
import { READER, story } from '../test/fixtures'
import { Votes } from './StoryRow'

const s = story({ key: 'hn-42' })

const meta = {
  title: 'Feed/Votes',
  component: Votes,
  args: { story: s },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Votes>
export default meta
type Story = StoryObj<typeof meta>

export const NoVote: Story = {}
export const Up: Story = { args: { vote: 1 } }
export const Down: Story = { args: { vote: -1 } }
export const NoScoreYet: Story = { args: { story: story({ score: undefined, source: 'rss', sourceLabel: 'Quanta' }) } }
export const BlueskyLikes: Story = { args: { story: story({ source: 'bluesky', sourceLabel: 'Bluesky', score: 1 }) } }

/** Signed in to Hacker News, the up arrow is a real HN upvote as well. */
export const SignedInToHackerNews: Story = { parameters: { app: { hn: { user: READER.handle, cookie: 'x', votes: {} } } } }

export const SignedInToBluesky: Story = {
  args: {
    story: story({ source: 'bluesky', sourceLabel: 'PaperWing', author: 'alice.example', ref: { uri: 'at://did:plc:alice/app.bsky.feed.post/1', cid: 'bafy-post' } }),
  },
  parameters: { app: { atproto: { did: READER.did, handle: READER.handle } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Upvote on PaperWing (a Bluesky like)' })).toHaveAttribute('aria-pressed', 'false')
  },
}

export const LocalVoteBeforeSigningIn: Story = {
  ...SignedInToBluesky,
  args: { ...SignedInToBluesky.args, vote: 1 },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Upvote on PaperWing (a Bluesky like)' })).toHaveAttribute('aria-pressed', 'true')
  },
}

export const DownvoteIsLocal: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Less like this' }))
    await expect(useActivity.getState().votes['hn-42']).toBe(-1)
  },
}
