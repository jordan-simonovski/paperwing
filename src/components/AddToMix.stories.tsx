import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { usePrefs } from '../lib/store'
import { AddToMix } from './AddToMix'

const mixes = [
  { id: 'aaaaaaaaaaaaa', name: 'Morning briefing', sources: [{ kind: 'topic' as const, id: 'science' }], updatedAt: 1 },
  { id: 'aaaaaaaaaaaab', name: 'Open web reading', sources: [{ kind: 'topic' as const, id: 'web' }], updatedAt: 1, published: 'at://did:plc:readerexampleabcdefghijk/io.paperwing.mix/aaaaaaaaaaaab' },
]

const meta = {
  title: 'Feed/AddToMix',
  component: AddToMix,
  args: { source: { kind: 'rss', url: 'https://anildash.com/feed.xml', label: 'Anil Dash' }, label: 'Anil Dash' },
  parameters: { layout: 'centered', app: { prefs: { mixes } } },
} satisfies Meta<typeof AddToMix>
export default meta
type Story = StoryObj<typeof meta>

export const Button: Story = {}
export const IconOnly: Story = { args: { iconOnly: true } }
export const AlreadyInAMix: Story = { args: { source: { kind: 'topic', id: 'science' }, label: 'Science' } }

export const AddsToAMix: Story = {
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Add to mix: Anil Dash' }))
    // The sheet renders at the top of the page, outside the story's root.
    const sheet = within(canvasElement.ownerDocument.body).getByRole('dialog', { name: 'Add to mix' })
    await userEvent.click(within(sheet).getByRole('button', { name: /Morning briefing/ }))
    await expect(usePrefs.getState().mixes[0].sources).toContainEqual({ kind: 'rss', url: 'https://anildash.com/feed.xml', label: 'Anil Dash' })
  },
}

export const NoMixesYet: Story = { parameters: { app: { prefs: { mixes: [] } } } }
