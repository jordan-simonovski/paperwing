import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import type { Labeler } from '../lib/moderation'
import { usePrefs } from '../lib/store'
import { Labelers } from './ModerationSettings'

const aegis: Labeler = {
  did: 'did:plc:labelerexampleabcdefghijk',
  name: 'Aegis',
  handle: 'aegis.blue',
  defs: {
    spoiler: { name: 'Spoilers', setting: 'warn' },
    'graphic-media': { name: 'Graphic media', setting: 'warn', media: true },
    spam: { name: 'Spam', setting: 'hide' },
  },
}

const meta = {
  title: 'Settings/Labelers',
  component: Labelers,
  parameters: { app: { prefs: { labelers: [aegis] } } },
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof Labelers>
export default meta
type Story = StoryObj<typeof meta>

export const Subscribed: Story = {}
export const None: Story = { parameters: { app: { prefs: { labelers: [] } } } }

export const ChooseWhatALabelDoes: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: /choose what they do/ }))
    await userEvent.click(within(await canvas.findByRole('radiogroup', { name: 'Spoilers' })).getByRole('radio', { name: 'Show' }))
    await expect(usePrefs.getState().labelers[0].defs.spoiler.setting).toBe('ignore')
  },
}

export const Unsubscribe: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Unsubscribe from Aegis' }))
    await expect(usePrefs.getState().labelers).toEqual([])
  },
}
