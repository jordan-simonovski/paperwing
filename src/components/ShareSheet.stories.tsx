import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { story } from '../test/fixtures'
import { ShareSheet } from './ShareSheet'

const ME = 'did:plc:readerreaderreaderreader'
const bsky = { did: ME, handle: 'reader.example', scope: 'atproto repo:io.paperwing.submission' }
const page = () => within(document.body)
const rss = story({ key: 'rss-web', source: 'rss', sourceLabel: 'anildash.com', site: 'anildash.com', discussionUrl: null, hasThread: false })

const meta = {
  title: 'Reading/ShareSheet',
  component: ShareSheet,
  args: { story: rss, onClose: fn() },
} satisfies Meta<typeof ShareSheet>
export default meta
type Story = StoryObj<typeof meta>

/** Signed in nowhere: every network says how to sign in. */
export const SignedOut: Story = {
  play: async () => {
    await waitFor(() => expect(page().getByRole('link', { name: 'Sign in with Bluesky' })).toBeVisible())
    await expect(page().getByRole('button', { name: /^Share$/ })).toBeDisabled()
  },
}

export const Bluesky: Story = {
  parameters: { app: { atproto: bsky } },
  play: async () => {
    await waitFor(() => expect(page().getByText('List it on PaperWing')).toBeVisible())
    await waitFor(() => expect(page().getByRole('combobox', { name: 'Board' })).toBeVisible())
  },
}

export const EverywhereAtOnce: Story = {
  parameters: {
    app: {
      atproto: bsky,
      hn: { user: 'reader', votes: {} },
      mastodon: { instance: 'mastodon.social', token: 'x', acct: 'reader', scope: 'read write' },
      lemmy: { instance: 'lemmy.world', user: 'reader', jwt: 'x', votes: {} },
      prefs: {
        communities: [{ name: 'technology@lemmy.world', title: 'Technology' }],
        boards: [{ uri: 'at://did:plc:ownerownerownerownerowne/io.paperwing.board/3kboardboard2', name: 'The Open Web' }],
      },
    },
  },
}

/** Bluesky's 300-character limit: a long take goes over, and posting is held back. */
export const TooLongForBluesky: Story = {
  parameters: { app: { atproto: bsky } },
  play: async () => {
    const take = page().getByRole('textbox', { name: 'Your take' })
    await userEvent.click(take)
    await userEvent.paste('This essay is the clearest case I know for why feeds, links, blogrolls and shared items mattered. '.repeat(4))
    await expect(page().getByRole('button', { name: /^Share$/ })).toBeDisabled()
  },
}

/** From Hacker News: re-submitting to HN only finds the same thread, so it's not offered. */
export const FromHackerNews: Story = {
  args: { story: story() },
  parameters: { app: { atproto: bsky, hn: { user: 'reader', votes: {} } } },
  play: async () => {
    await waitFor(() => expect(page().getByText('Already on Hacker News')).toBeVisible())
  },
}

/** Listed on a community board: it stays there unless you also put it on the front page. */
export const OnACommunityBoard: Story = {
  parameters: { app: { atproto: bsky, prefs: { boards: [{ uri: 'at://did:plc:uuuuuuuuuuuuuuuuuuuuuuuu/io.paperwing.board/3kitchenboard', name: 'Home Cooking' }] } } },
  play: async () => {
    const board = await waitFor(() => page().getByRole('combobox', { name: 'Board' }))
    // A topic board is part of the front page already: nothing to choose.
    await userEvent.selectOptions(board, 'Science')
    await expect(page().queryByRole('checkbox', { name: /front page/ })).toBeNull()
    await userEvent.selectOptions(board, 'Home Cooking')
    const front = page().getByRole('checkbox', { name: /Also on PaperWing’s front page/ })
    await expect(front).not.toBeChecked()
  },
}

/** A board only its moderators post on: someone else is told, and can't list there. */
export const OnAModeratorsOnlyBoard: Story = {
  parameters: {
    app: {
      atproto: bsky,
      prefs: { boards: [{ uri: 'at://did:plc:eprq6bm2okrgk6zsoka2wpux/io.paperwing.board/3announcement', name: 'Announcements' }] },
      queries: [
        [
          ['board', 'did:plc:eprq6bm2okrgk6zsoka2wpux', '3announcement'],
          {
            uri: 'at://did:plc:eprq6bm2okrgk6zsoka2wpux/io.paperwing.board/3announcement',
            name: 'Announcements',
            owner: 'did:plc:eprq6bm2okrgk6zsoka2wpux',
            moderators: [],
            moderatorHandles: {},
            official: true,
            createdAt: '2026-10-01T00:00:00Z',
          },
        ],
      ],
    },
  },
  play: async () => {
    await userEvent.selectOptions(await waitFor(() => page().getByRole('combobox', { name: 'Board' })), 'Announcements')
    await expect(await page().findByText('Only its moderators post on Announcements.')).toBeVisible()
    await expect(page().queryByRole('checkbox', { name: /front page/ })).toBeNull()
  },
}
