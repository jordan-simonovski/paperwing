import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'
import { usePrefs } from '../lib/store'
import { StatusPagesSettings } from './StatusPagesSettings'

const meta = {
  title: 'Settings/StatusPages',
  component: StatusPagesSettings,
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof StatusPagesSettings>
export default meta
type Story = StoryObj<typeof meta>

export const Suggestions: Story = {}
export const Following: Story = {
  parameters: {
    app: {
      prefs: {
        statusPages: [
          { host: 'status.tailscale.com', name: 'Tailscale' },
          { host: 'status.fly.io', name: 'Fly.io' },
        ],
      },
    },
  },
}

export const FollowASuggestion: Story = {
  parameters: { app: { fetch: { 'src=statuscheck': { host: 'status.temporal.io', name: 'Temporal' } } } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Temporal/ }))
    await waitFor(() => expect(usePrefs.getState().statusPages).toEqual([{ host: 'status.temporal.io', name: 'Temporal' }]))
  },
}
