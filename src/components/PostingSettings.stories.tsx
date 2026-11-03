import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import { usePrefs } from '../lib/store'
import { PostingSettings } from './PostingSettings'

const meta = {
  title: 'Settings/PostingSettings',
  component: PostingSettings,
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof PostingSettings>
export default meta
type Story = StoryObj<typeof meta>

/** On to start with: every picture gets a description. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('checkbox', { name: /Require alt text/ })).toBeChecked()
  },
}

/** Turned off, and it syncs. */
export const TurnOff: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('checkbox', { name: /Require alt text/ }))
    await expect(usePrefs.getState().requireAlt).toBe(false)
    await expect(usePrefs.getState().syncedPrefsAt).toBeGreaterThan(0)
  },
}
