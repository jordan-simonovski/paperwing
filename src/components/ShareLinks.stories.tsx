import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { story } from '../test/fixtures'
import { ShareLinks } from './ShareLinks'

const ME = 'did:plc:readerreaderreaderreader'
const page = () => within(document.body)

const meta = {
  title: 'Reading/ShareLinks',
  component: ShareLinks,
  args: { story: story(), onClose: fn() },
} satisfies Meta<typeof ShareLinks>
export default meta
type Story = StoryObj<typeof meta>

/** Signed out: the three links to send. */
export const Links: Story = {
  play: async () => {
    await waitFor(() => expect(page().getByRole('dialog', { name: 'Share' })).toBeVisible())
    await waitFor(() => expect(page().getByText('PaperWing link')).toBeVisible())
    await expect(page().getByText('Opens on the article, with every discussion of it')).toBeVisible()
    await waitFor(() => expect(page().getByText('Original article')).toBeVisible())
    await waitFor(() => expect(page().getByText('The Hacker News discussion')).toBeVisible())
  },
}

/** A Bluesky text post has no article link. */
export const PostWithoutLink: Story = {
  args: { story: story({ key: 'bs-1', source: 'bluesky', sourceLabel: 'Bluesky', url: null, discussionUrl: 'https://bsky.app/profile/paperwing.io/post/1' }) },
  play: async () => {
    await waitFor(() => expect(page().getByText('With every discussion of it')).toBeVisible())
  },
}

export const SignedInWithBluesky: Story = {
  parameters: { app: { atproto: { did: ME, handle: 'reader.example' } } },
}

export const ShareWithANote: Story = {
  parameters: { app: { atproto: { did: ME, handle: 'reader.example' } } },
  play: async () => {
    await userEvent.click(page().getByRole('button', { name: /Share on PaperWing/ }))
    const note = page().getByRole('textbox', { name: 'Your note' })
    await userEvent.type(note, 'Still the clearest case for why feeds, links and blogrolls mattered.')
    await expect(note).toHaveValue('Still the clearest case for why feeds, links and blogrolls mattered.')
  },
}

/** Already shared by you: it can be taken back. */
export const AlreadyShared: Story = {
  args: { story: story({ shareUri: `at://${ME}/io.paperwing.share/3kshare` }) },
  parameters: { app: { atproto: { did: ME, handle: 'reader.example' } } },
}
