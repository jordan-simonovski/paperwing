import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { story } from '../test/fixtures'
import { WritePost } from './WritePost'

const ME = 'did:plc:readerreaderreaderreader'
const bsky = { did: ME, handle: 'reader.example', scope: 'atproto repo:app.bsky.feed.post?action=create repo:io.paperwing.submission?action=create&action=update' }
const page = () => within(document.body)
const mine = story({
  key: 'bs-mine',
  source: 'bluesky',
  sourceLabel: 'Bluesky',
  title: 'What are you reading this month?',
  url: null,
  authorDid: ME,
  ref: { uri: `at://${ME}/app.bsky.feed.post/3m2abcdefghij`, cid: 'c' },
  selfPost: { body: 'I’m on **Piranesi**.', versions: [{ body: 'I’m on **Piranesi**.', seenAt: 0 }] },
})

const meta = {
  title: 'Writing/WritePost',
  component: WritePost,
  args: { onClose: fn() },
} satisfies Meta<typeof WritePost>
export default meta
type Story = StoryObj<typeof meta>

/** Signed out: posts go out from a Bluesky account, so it says how to sign in. */
export const SignedOut: Story = {
  play: async () => {
    await waitFor(() => expect(page().getByRole('link', { name: 'Sign in with Bluesky' })).toBeVisible())
    await expect(page().getByRole('button', { name: 'Post' })).toBeDisabled()
  },
}

/** Ready to write: a title, the words and where it goes. Post waits for both. */
export const Writing: Story = {
  parameters: { app: { atproto: bsky } },
  play: async () => {
    await waitFor(() => expect(page().getByRole('combobox', { name: 'Board' })).toBeVisible())
    await expect(page().getByRole('button', { name: 'Post' })).toBeDisabled()
    await userEvent.type(page().getByRole('textbox', { name: 'Title' }), 'What are you reading?')
    await userEvent.type(page().getByRole('textbox', { name: 'Your post' }), 'Tell me.')
    await expect(page().getByRole('button', { name: 'Post' })).toBeEnabled()
  },
}

/** On a board: the board is picked already. */
export const OnABoard: Story = {
  parameters: { app: { atproto: bsky } },
  args: { board: 'space' },
  play: async () => {
    await waitFor(() => expect(page().getByRole('combobox', { name: 'Board' })).toHaveValue('space'))
  },
}

/** Editing your own: the words, not the title, which is the Bluesky post’s. Save waits for a change. */
export const Editing: Story = {
  parameters: { app: { atproto: bsky } },
  args: { edit: mine },
  play: async () => {
    const words = page().getByRole('textbox', { name: 'Your post' })
    await waitFor(() => expect(words).toHaveValue('I’m on **Piranesi**.'))
    await expect(page().queryByRole('textbox', { name: 'Title' })).toBeNull()
    await expect(page().getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.type(words, ' Loving it.')
    await expect(page().getByRole('button', { name: 'Save' })).toBeEnabled()
  },
}

/** Signed in before editing was asked for: it says to allow it. */
export const EditingNeedsPermission: Story = {
  parameters: { app: { atproto: { ...bsky, scope: 'atproto repo:io.paperwing.submission?action=create' } } },
  args: { edit: mine },
  play: async () => {
    await waitFor(() => expect(page().getByRole('link', { name: 'Allow it under Settings, Sources' })).toBeVisible())
    await expect(page().getByRole('button', { name: 'Save' })).toBeDisabled()
  },
}
