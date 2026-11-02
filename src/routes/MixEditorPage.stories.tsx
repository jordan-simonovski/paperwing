import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'
import type { Mix } from '../lib/store'
import { useUI } from '../lib/ui'
import { MixEditorPage } from './MixEditorPage'

const DID = 'did:plc:paperwingreaderabcdefghi'
const ID = 'bbbbbbbbbbbbb'
const published: Mix = {
  id: ID,
  name: 'Space and science',
  sources: [{ kind: 'topic', id: 'space' }],
  published: `at://${DID}/io.paperwing.mix/${ID}`,
  updatedAt: Date.parse('2026-10-01T00:00:00.000Z'),
}

const meta = {
  title: 'Pages/MixEditor',
  component: MixEditorPage,
  parameters: { app: { route: { path: '/mixes/:id?', url: '/mixes/new' } } },
} satisfies Meta<typeof MixEditorPage>
export default meta
type Story = StoryObj<typeof meta>

export const NewMix: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Mix name' })).toHaveValue('')
    await expect(canvas.getByRole('button', { name: 'Save and open' })).toBeDisabled()
  },
}

/**
 * A published mix whose republish fails (here, a sign-in from before mixes could be published):
 * Save and open stays in the editor, where the edit can be tried again.
 */
export const RepublishFails: Story = {
  parameters: { app: { prefs: { mixes: [published] }, atproto: { did: DID, handle: 'reader.example', scope: 'atproto' }, route: { path: '/mixes/:id?', url: `/mixes/${ID}` } } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Save and open' }))
    await waitFor(() => expect(useUI.getState().toasts.some((t) => t.tone === 'error')).toBe(true))
    await expect(canvas.getByRole('textbox', { name: 'Mix name' })).toHaveValue('Space and science')
  },
}
