import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within, waitFor } from 'storybook/test'
import { channelFor } from '../test/fixtures'
import { useUI } from '../lib/ui'
import { ChannelShare } from './ChannelShare'

const meta = {
  title: 'Feed/Share channel',
  component: ChannelShare,
  args: { channel: channelFor('space'), sort: 'new' },
} satisfies Meta<typeof ChannelShare>
export default meta
type Story = StoryObj<typeof meta>

export const Topic: Story = {
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Share Space' }))
    const sheet = await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Share Space' })
    await waitFor(() => expect(sheet).toBeVisible())
    await expect(within(sheet).getByRole('textbox', { name: 'Link' })).toHaveValue(`${location.origin}/t/space?sort=new`)
  },
}
export const PersonalFeed: Story = { args: { channel: channelFor('for-you') }, play: async ({ canvas }) => userEvent.click(canvas.getByRole('button', { name: 'Share For you' })) }
export const UnpublishedMix: Story = {
  args: { channel: { id: 'mix:3m2abcdefghij', label: 'Weekend reading', eyebrow: 'Mix', feeds: [] } },
  play: async ({ canvas }) => userEvent.click(canvas.getByRole('button', { name: 'Share Weekend reading' })),
}
export const PrivateFeed: Story = {
  args: { channel: { id: 'feed:https://reading.example/rss?token=secret', label: 'Private reading', eyebrow: 'Feed', feeds: [] } },
  play: async ({ canvas }) => userEvent.click(canvas.getByRole('button', { name: 'Share Private reading' })),
}
export const CopyDenied: Story = {
  beforeEach: () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Denied')
        },
      },
    })
    return () => {
      if (original) Object.defineProperty(navigator, 'clipboard', original)
      else delete (navigator as { clipboard?: unknown }).clipboard
    }
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Share Space' }))
    const sheet = await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Share Space' })
    await waitFor(() => expect(sheet).toBeVisible())
    await userEvent.click(within(sheet).getByRole('button', { name: 'Copy link' }))
    await waitFor(() => expect(useUI.getState().toasts.at(-1)?.message).toContain('Couldn’t copy'))
    await expect(within(sheet).getByRole('textbox', { name: 'Link' })).toBeVisible()
  },
}

export const NativeShare: Story = {
  beforeEach: () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'share')
    Object.defineProperty(navigator, 'share', { configurable: true, value: fn().mockResolvedValue(undefined) })
    return () => {
      if (original) Object.defineProperty(navigator, 'share', original)
      else delete (navigator as { share?: unknown }).share
    }
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Share Space' }))
    const sheet = await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Share Space' })
    await waitFor(() => expect(sheet).toBeVisible())
    await userEvent.click(within(sheet).getByRole('button', { name: 'Share link' }))
    await expect(navigator.share).toHaveBeenCalledWith({ title: 'Space', url: `${location.origin}/t/space?sort=new` })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
    await expect(canvas.getByRole('button', { name: 'Share Space' })).toHaveFocus()
  },
}

export const NativeShareDenied: Story = {
  beforeEach: () => {
    const share = Object.getOwnPropertyDescriptor(navigator, 'share')
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    const denied = async () => {
      throw new Error('Denied')
    }
    Object.defineProperty(navigator, 'share', { configurable: true, value: denied })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: denied } })
    return () => {
      if (share) Object.defineProperty(navigator, 'share', share)
      else delete (navigator as { share?: unknown }).share
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
      else delete (navigator as { clipboard?: unknown }).clipboard
    }
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Share Space' }))
    const sheet = await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Share Space' })
    await waitFor(() => expect(sheet).toBeVisible())
    await userEvent.click(within(sheet).getByRole('button', { name: 'Share link' }))
    await waitFor(() => expect(useUI.getState().toasts.at(-1)?.message).toBe('Couldn’t share the link. Try Copy link instead.'))
    await expect(within(sheet).getByRole('textbox', { name: 'Link' })).toBeVisible()
  },
}
