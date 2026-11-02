import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import type { NoteView } from '../lib/notes'
import { NOW } from '../test/fixtures'
import { MarginNotes } from './MarginNotes'

const URL = 'https://paperwing.io/principles'
const HTML = [
  '<p>Social media didn’t go wrong by accident. When the money comes from selling attention, every incentive points the same way: keep people scrolling, keep them angry, keep them locked in, and know as much about them as possible.</p>',
  '<p>The open web was meant to be something else, and the open networks growing now (Bluesky, Mastodon, Lemmy) are a second chance at it.</p>',
  '<p>PaperWing is a reader for that web. These are the commitments that keep it on the reader’s side. Hold us to them.</p>',
].join('')
const ME = 'did:plc:readerreaderreaderreader'
const notes: NoteView[] = [
  {
    uri: 'at://did:plc:pwpwpwpwpwpwpwpwpwpwpwpw/io.paperwing.note/3knote1',
    did: 'did:plc:pwpwpwpwpwpwpwpwpwpwpwpw',
    handle: 'paperwing.io',
    quote: 'the open networks growing now (Bluesky, Mastodon, Lemmy) are a second chance at it',
    note: 'Second chances are rare. This is why we build on open protocols instead of our own walled garden.',
    createdAt: new Date(NOW - 2 * 3_600_000).toISOString(),
  },
  {
    uri: `at://${ME}/io.paperwing.note/3knote2`,
    did: ME,
    handle: 'reader.example',
    quote: 'keep people scrolling, keep them angry',
    note: 'The angry part is the one nobody admits to optimising for.',
    createdAt: new Date(NOW - 20 * 60_000).toISOString(),
  },
]

/** An article's text, with the notes for it underneath, the way the reader view lays them out. */
function Reader({ url, html }: { url: string; html: string }) {
  const prose = useRef<HTMLDivElement>(null)
  return (
    <article className="mx-auto max-w-[38rem] px-4 py-7">
      <div ref={prose} className="prose" dangerouslySetInnerHTML={{ __html: html }} />
      <MarginNotes url={url} container={prose} html={html} />
    </article>
  )
}

const meta = {
  title: 'Reading/MarginNotes',
  component: MarginNotes,
  render: () => <Reader url={URL} html={HTML} />,
  parameters: { app: { queries: [[['notes', URL], notes]] } },
} satisfies Meta<typeof MarginNotes>
export default meta
// MarginNotes is rendered through Reader, which supplies its props.
type Story = StoryObj<typeof meta>

export const OthersNotes: Story = {
  args: { url: URL, html: HTML, container: { current: null } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: /Margin notes · 2/ })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /Remove/ })).toBeNull()
  },
}

/** Signed in: your own note can be removed, and selecting a passage offers to note it. */
export const SignedIn: Story = {
  args: { url: URL, html: HTML, container: { current: null } },
  parameters: { app: { atproto: { did: ME, handle: 'reader.example' } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /Remove/ })).toBeVisible()
    // Select the last paragraph's first sentence: the offer appears (outside the story, on the page).
    const p = canvas.getByText(/PaperWing is a reader for that web/)
    const range = document.createRange()
    range.setStart(p.firstChild!, 0)
    range.setEnd(p.firstChild!, 'PaperWing is a reader for that web.'.length)
    document.getSelection()!.removeAllRanges()
    document.getSelection()!.addRange(range)
    const offer = await within(document.body).findByRole('button', { name: /Note this passage/ })
    await userEvent.click(offer)
    await expect(await within(document.body).findByRole('dialog', { name: 'Margin note' })).toBeVisible()
  },
}

/** Signed out: selecting still offers a note, and the offer explains how to sign in instead of doing nothing. */
export const SignedOut: Story = {
  args: { url: URL, html: HTML, container: { current: null } },
  play: async ({ canvas }) => {
    const p = canvas.getByText(/PaperWing is a reader for that web/)
    const range = document.createRange()
    range.setStart(p.firstChild!, 0)
    range.setEnd(p.firstChild!, 'PaperWing is a reader for that web.'.length)
    document.getSelection()!.removeAllRanges()
    document.getSelection()!.addRange(range)
    const page = within(document.body)
    await userEvent.click(await page.findByRole('button', { name: /Note this passage/ }))
    const sheet = await page.findByRole('dialog', { name: 'Margin note' })
    await expect(within(sheet).getByRole('link', { name: 'Sign in with Bluesky' })).toHaveAttribute('href', '/settings/sources')
    // The sheet fades in.
    await waitFor(() => expect(within(sheet).getByRole('button', { name: 'Not now' })).toBeVisible())
  },
}

export const NoNotesYet: Story = {
  args: { url: URL, html: HTML, container: { current: null } },
  parameters: { app: { queries: [[['notes', URL], []]] } },
}
