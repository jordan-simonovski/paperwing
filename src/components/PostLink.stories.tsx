import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { useComposer } from '../lib/compose'
import { PostLink } from './PostLink'

const page = () => within(document.body)

const meta = {
  title: 'Reading/PostLink',
  component: PostLink,
  args: { onClose: fn() },
  // Cards by link, so a story can answer two links differently.
  parameters: { app: { fetch: { 'blog.example%2Fslow': { title: 'On reading slowly', description: 'Why it matters.' } } } },
} satisfies Meta<typeof PostLink>
export default meta
type Story = StoryObj<typeof meta>

/** Nothing to post until there's a link and a title. */
export const Empty: Story = {
  play: async () => {
    await expect(page().getByRole('button', { name: /Next/ })).toBeDisabled()
  },
}

/** Typing a link reads the page's title; Next hands the story to the share sheet, on the board it came from. */
export const FromALink: Story = {
  args: { board: 'web' },
  play: async () => {
    await userEvent.type(page().getByLabelText('Link'), 'blog.example/slow')
    await waitFor(() => expect(page().getByLabelText(/Title/)).toHaveValue('On reading slowly'))
    await waitFor(() => expect(page().getByRole('button', { name: /Next/ })).toBeEnabled())
    await userEvent.click(page().getByRole('button', { name: /Next/ }))
    await waitFor(() => expect(useComposer.getState().target).toMatchObject({ kind: 'share', board: 'web', story: { url: 'https://blog.example/slow', title: 'On reading slowly' } }))
  },
}

/** A title you've typed is never replaced by the page's. */
export const YourTitleWins: Story = {
  args: { url: 'https://blog.example/slow', title: 'Worth your ten minutes' },
  play: async () => {
    await new Promise((r) => setTimeout(r, 500))
    await expect(page().getByLabelText(/Title/)).toHaveValue('Worth your ten minutes')
  },
}

/** Words that aren't a link say so. */
export const NotALink: Story = {
  play: async () => {
    await userEvent.type(page().getByLabelText('Link'), 'just some words')
    await expect(page().getByText(/doesn’t look like a web link/)).toBeVisible()
    await expect(page().getByRole('button', { name: /Next/ })).toBeDisabled()
  },
}

/** Changing the link drops the old page's title: the next link waits for its own. */
export const ChangingTheLink: Story = {
  parameters: { app: { fetch: { 'blog.example%2Ffast': { title: 'On reading fast' } } } },
  play: async () => {
    await userEvent.type(page().getByLabelText('Link'), 'blog.example/slow')
    await waitFor(() => expect(page().getByLabelText(/Title/)).toHaveValue('On reading slowly'))
    await userEvent.clear(page().getByLabelText('Link'))
    await userEvent.type(page().getByLabelText('Link'), 'blog.example/fast')
    await expect(page().getByLabelText(/Title/)).not.toHaveValue('On reading slowly')
    await waitFor(() => expect(page().getByLabelText(/Title/)).toHaveValue('On reading fast'))
  },
}
