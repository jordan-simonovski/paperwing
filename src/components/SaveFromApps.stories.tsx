import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'
import { useSync } from '../lib/sync'
import { useUI } from '../lib/ui'
import { SaveFromApps, SaveFromClipboardButton } from './SaveFromApps'

// Sync isn't one of the harness's stores yet, so these set it directly and put it back after.
const withSyncCode = (code?: string) => () => {
  const before = useSync.getState()
  useSync.setState({ code })
  return () => useSync.setState(before, true)
}

const meta = {
  title: 'Settings/SaveFromApps',
  component: SaveFromApps,
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof SaveFromApps>
export default meta
type Story = StoryObj<typeof meta>

/** Without sync there's no inbox to post to, so it explains how to turn sync on. */
export const NoSync: Story = { beforeEach: withSyncCode(undefined) }
export const WithSync: Story = { beforeEach: withSyncCode('abcdefghijklmnopqrstuvwxyz') }

export const ClipboardWithoutALink: Story = {
  render: () => <SaveFromClipboardButton />,
  beforeEach: () => {
    const original = navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => 'just some words' } })
    return () => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: original })
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Save link from clipboard/ }))
    await waitFor(() => expect(useUI.getState().toasts.at(-1)?.message).toBe('There’s no link on the clipboard'))
  },
}
