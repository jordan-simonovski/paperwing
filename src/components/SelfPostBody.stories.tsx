import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { NOW } from '../test/fixtures'
import { SelfPostBody } from './SelfPostBody'

const HOUR = 3_600_000
const original = 'What are you all reading this month?\n\nI’m on **Piranesi**.'
const now = 'What are you all reading this month?\n\nI’m on **Piranesi**, and loving it.\n\n- Tell me yours\n- And why'

const meta = {
  title: 'Reading/SelfPostBody',
  component: SelfPostBody,
  args: { body: original, versions: [{ body: original, seenAt: NOW - 3 * HOUR }], now: NOW },
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof SelfPostBody>
export default meta
type Story = StoryObj<typeof meta>

/** Someone else’s post, never edited: just the words. */
export const Words: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Piranesi').tagName).toBe('STRONG')
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

/** Your own post: you can edit it. */
export const Yours: Story = {
  args: { onEdit: fn() },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Edit' }))
    await expect(args.onEdit).toHaveBeenCalled()
  },
}

/** Edited: it says so, and every version can be read. */
export const Edited: Story = {
  args: {
    body: now,
    versions: [
      { body: original, seenAt: NOW - 3 * HOUR },
      { body: now, seenAt: NOW - HOUR },
    ],
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Edited 1h ago' }))
    const sheet = within(document.body)
    await waitFor(() => expect(sheet.getByRole('region', { name: /^Earlier version/ })).toBeVisible())
    await expect(within(sheet.getByRole('region', { name: /^Earlier version/ })).queryByText(/loving it/)).toBeNull()
    await expect(within(sheet.getByRole('region', { name: 'Current version' })).getByText(/loving it/)).toBeVisible()
  },
}

/** Edited more than a day ago: it still says so, but what it said before is gone. */
export const EditedLongAgo: Story = {
  args: { body: now, versions: [{ body: now, seenAt: NOW - 30 * HOUR }], editedAt: NOW - 30 * HOUR },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Edited 1d ago/)).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /Edited/ })).toBeNull()
  },
}
