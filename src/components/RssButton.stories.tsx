import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'
import { useUI } from '../lib/ui'
import { RssButton } from './RssButton'

const meta = {
  title: 'Feed/RssButton',
  component: RssButton,
  args: { path: '/rss/topic/space' },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof RssButton>
export default meta
type Story = StoryObj<typeof meta>

export const Icon: Story = {}
export const WithLabel: Story = { args: { label: 'RSS', className: 'pill h-7 px-2.5 text-[0.8125rem]' } }

export const CopiesTheFeedAddress: Story = {
  beforeEach: () => {
    const original = navigator.clipboard
    let copied = ''
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void (copied = t) } })
    ;(globalThis as { copied?: () => string }).copied = () => copied
    return () => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: original })
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Copy RSS feed address' }))
    await waitFor(() => expect((globalThis as unknown as { copied: () => string }).copied()).toMatch(/\/rss\/topic\/space$/))
    await waitFor(() => expect(useUI.getState().toasts[0]?.message).toMatch(/Feed address copied/))
  },
}
