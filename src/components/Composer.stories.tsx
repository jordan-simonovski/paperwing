import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import { useComposer } from '../lib/compose'
import { Composer } from './Composer'

const ref = { uri: 'at://did:plc:readerexampleabcdefghijk/app.bsky.feed.post/3kabc', cid: 'bafyreiexample' }

const meta = {
  title: 'Chrome/Composer',
  component: Composer,
  parameters: { app: { composer: { target: { kind: 'bsky-reply', threadKey: 'bs-1', root: ref, parent: ref, to: 'anildash.com' } } } },
  globals: { viewport: { value: 'mobile2', isRotated: false } },
} satisfies Meta<typeof Composer>
export default meta
type Story = StoryObj<typeof meta>

export const BlueskyReply: Story = {}
export const HackerNewsReply: Story = { parameters: { app: { composer: { target: { kind: 'hn-reply', threadKey: 'hn-1', parent: '1', story: true, to: 'pg' } } } } }
export const Closed: Story = { parameters: { app: { composer: { target: undefined } } } }

/** Bluesky's 300-character limit: past it, Post is disabled. */
export const OverTheLimit: Story = {
  play: async ({ canvas }) => {
    const box = await canvas.findByRole('textbox', { name: 'Your post' })
    await userEvent.click(box)
    await userEvent.paste('a'.repeat(301))
    await expect(canvas.getByRole('button', { name: /Post|Reply/ })).toBeDisabled()
  },
}

export const Cancel: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Cancel' }))
    await expect(useComposer.getState().target).toBeUndefined()
  },
}
