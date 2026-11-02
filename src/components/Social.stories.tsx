import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import { useComposer } from '../lib/compose'
import { story } from '../test/fixtures'
import { HnVoteButton, LemmyVoteButton, ReactButton, StoryActions } from './Social'

const subject = { uri: 'at://did:plc:abcdefghijklmnopqrstuvwx/app.bsky.feed.post/3kabc', cid: 'bafyreib' }
const bsky = { did: 'did:plc:abcdefghijklmnopqrstuvwx', handle: 'reader.example' }

const meta = {
  title: 'Reading/Social',
  component: StoryActions,
  args: { story: story() },
  decorators: [
    (Story) => (
      <div className="flex flex-wrap items-center gap-2" style={{ padding: 16 }}>
        {Story()}
      </div>
    ),
  ],
} satisfies Meta<typeof StoryActions>
export default meta
type Story = StoryObj<typeof meta>

/** Signed out everywhere: nothing to write with, so no buttons. */
export const SignedOut: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

export const HackerNewsSignedIn: Story = {
  parameters: { app: { hn: { user: 'reader', cookie: 'x', votes: {} } } },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Comment/ }))
    await expect(useComposer.getState().target).toMatchObject({ kind: 'hn-reply', threadKey: args.story.key, story: true })
  },
}

export const BlueskyPost: Story = {
  args: { story: story({ key: 'bs-1', source: 'bluesky', sourceLabel: 'Bluesky', author: 'paperwing.io', url: null }), root: subject },
  parameters: { app: { atproto: bsky } },
}

export const LemmySignedIn: Story = {
  args: { story: story({ key: 'lm-1', source: 'lemmy', sourceLabel: 'c/technology', discussionUrl: 'https://lemmy.world/post/1' }) },
  parameters: { app: { lemmy: { instance: 'lemmy.world', user: 'reader', jwt: 'x', votes: {} } } },
}

export const MastodonCanPost: Story = { parameters: { app: { mastodon: { instance: 'mastodon.social', token: 'x', acct: 'reader', scope: 'read write' } } } }

export const LikeAndVote: Story = {
  render: () => (
    <>
      <ReactButton kind="like" subject={subject} />
      <ReactButton kind="vote" subject={subject} />
      <ReactButton kind="like" subject={subject} small />
    </>
  ),
}

export const AlreadyLiked: Story = {
  render: () => <ReactButton kind="like" subject={subject} />,
  parameters: { app: { reactions: { made: { [subject.uri]: 'at://did:plc:abcdefghijklmnopqrstuvwx/app.bsky.feed.like/1' } } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /Liked/ })).toHaveAttribute('aria-pressed', 'true')
  },
}

export const HackerNewsUpvote: Story = {
  render: () => (
    <>
      <HnVoteButton id="41234567" />
      <HnVoteButton id="41234568" />
    </>
  ),
  parameters: { app: { hn: { user: 'reader', votes: { '41234568': true } } } },
}

export const LemmyUpvote: Story = {
  render: () => (
    <>
      <LemmyVoteButton apId="https://lemmy.world/comment/1" />
      <LemmyVoteButton apId="https://lemmy.world/comment/2" small />
    </>
  ),
  parameters: { app: { lemmy: { user: 'reader', jwt: 'x', votes: { 'https://lemmy.world/comment/2': 1 } } } },
}
