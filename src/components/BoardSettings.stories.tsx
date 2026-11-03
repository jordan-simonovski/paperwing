import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import { usePrefs } from '../lib/store'
import { BoardSettings } from './BoardSettings'

const meta = {
  title: 'Settings/BoardSettings',
  component: BoardSettings,
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof BoardSettings>
export default meta
type Story = StoryObj<typeof meta>

/** Both on to start with. */
export const Defaults: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('checkbox', { name: /Suggest posts from boards/ })).toBeChecked()
    await expect(canvas.getByRole('checkbox', { name: /Show PaperWing’s announcements/ })).toBeChecked()
  },
}

/** Turning suggestions off is remembered, and syncs with the rest of your choices. */
export const TurnOffSuggestions: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('checkbox', { name: /Suggest posts from boards/ }))
    await expect(usePrefs.getState().boardPicks).toBe(false)
    await expect(usePrefs.getState().syncedPrefsAt).toBeGreaterThan(0)
  },
}

/** Already turned off. */
export const Off: Story = {
  parameters: { app: { prefs: { boardPicks: false, announcements: false } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('checkbox', { name: /Show PaperWing’s announcements/ })).not.toBeChecked()
  },
}
