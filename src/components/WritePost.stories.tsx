import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { story } from '../test/fixtures'
import { aPicture } from './PicturePicker.stories'
import { WritePost } from './WritePost'

const ME = 'did:plc:readerreaderreaderreader'
const bsky = { did: ME, handle: 'reader.example', scope: 'atproto blob:image/* repo:app.bsky.feed.post?action=create repo:io.paperwing.submission?action=create&action=update' }
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

/** Pictures instead of words: Post waits until every picture is described. */
export const PicturesNeedDescribing: Story = {
  parameters: { app: { atproto: bsky } },
  play: async () => {
    await userEvent.type(await page().findByRole('textbox', { name: 'Title' }), 'Our new kitchen')
    await userEvent.upload(page().getByLabelText('Choose pictures'), await aPicture())
    const describe = await page().findByRole('textbox', { name: /Describe picture 1/ })
    await expect(page().getByRole('button', { name: 'Post' })).toBeDisabled()
    await expect(page().getByText(/Describe every picture to post it/)).toBeVisible()
    // Saying where the setting is never takes you away from the post you're writing.
    await expect(page().queryByRole('link', { name: /Alt text/ })).toBeNull()
    await userEvent.type(describe, 'A green tiled kitchen')
    await waitFor(() => expect(page().getByRole('button', { name: 'Post' })).toBeEnabled())
  },
}

/** Signed in before pictures were asked for: it says to allow them, and words still post. */
export const PicturesNeedPermission: Story = {
  parameters: { app: { atproto: { ...bsky, scope: 'atproto repo:app.bsky.feed.post?action=create repo:io.paperwing.submission?action=create&action=update' } } },
  play: async () => {
    await waitFor(() => expect(page().getByRole('link', { name: 'Allow pictures under Settings, Sources' })).toBeVisible())
    await expect(page().queryByLabelText('Choose pictures')).toBeNull()
  },
}

/** Alt text turned off in settings: pictures can go undescribed. */
export const AltTextOff: Story = {
  parameters: { app: { atproto: bsky, prefs: { requireAlt: false } } },
  play: async () => {
    await userEvent.type(await page().findByRole('textbox', { name: 'Title' }), 'Our new kitchen')
    await userEvent.upload(page().getByLabelText('Choose pictures'), await aPicture())
    await page().findByRole('textbox', { name: /Describe picture 1/ })
    await waitFor(() => expect(page().getByRole('button', { name: 'Post' })).toBeEnabled())
  },
}

const OWNER = 'did:plc:ownerownerownerownerowne'
const WORDS = `at://${OWNER}/io.paperwing.board/3m2wordsonlya`
/** A board that takes no pictures says so, and won't take them. */
export const NoPicturesBoard: Story = {
  parameters: {
    app: {
      atproto: bsky,
      prefs: { boards: [{ uri: WORDS, name: 'Words Only' }] },
      queries: [[['board', OWNER, '3m2wordsonlya'], { uri: WORDS, owner: OWNER, name: 'Words Only', moderators: [], moderatorHandles: {}, noImages: true, createdAt: '2026-11-01T00:00:00Z' }]],
    },
  },
  args: { board: WORDS },
  play: async () => {
    await userEvent.type(await page().findByRole('textbox', { name: 'Title' }), 'Our new kitchen')
    await userEvent.upload(page().getByLabelText('Choose pictures'), await aPicture())
    await page().findByRole('textbox', { name: /Describe picture 1/ })
    await userEvent.type(page().getByRole('textbox', { name: /Describe picture 1/ }), 'A kitchen')
    await waitFor(() => expect(page().getByText(/Words Only takes no pictures/)).toBeVisible())
    await expect(page().getByRole('button', { name: 'Post' })).toBeDisabled()
  },
}
