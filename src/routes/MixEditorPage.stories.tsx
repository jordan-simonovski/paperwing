import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'
import type { Mix } from '../lib/store'
import { useUI } from '../lib/ui'
import { usePrefs } from '../lib/store'
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

export const NativePublisher: Story = {
  parameters: { app: { fetch: { 'src=discover': [{ url: 'https://lab.leaflet.pub', title: 'Leaflet Lab Notes', site: 'lab.leaflet.pub', posts: 0, format: 'standard' }] } } },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole('textbox', { name: 'Mix name' }), 'Open publishing')
    await userEvent.type(canvas.getByPlaceholderText('theconversation.com, a blog, a newsletter'), 'lab.leaflet.pub')
    await userEvent.click(canvas.getByRole('button', { name: 'Find' }))
    await expect(await canvas.findByRole('button', { name: 'Leaflet Lab Notes' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Save and open' }))
    await expect(usePrefs.getState().mixes[0].sources).toEqual([{ kind: 'standard', url: 'https://lab.leaflet.pub', label: 'Leaflet Lab Notes' }])
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

/** A private feed stays in your mix but out of what's published, and the editor says so. */
export const PrivateFeedStaysOut: Story = {
  parameters: {
    app: {
      prefs: {
        mixes: [
          {
            ...published,
            sources: [
              { kind: 'topic', id: 'space' },
              { kind: 'rss', url: 'https://gitlab.example/me.atom?feed_token=glft-secret', label: 'GitLab activity' },
            ],
          },
        ],
      },
      atproto: { did: DID, handle: 'reader.example' },
      route: { path: '/mixes/:id?', url: `/mixes/${ID}` },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Remove GitLab activity' })).toBeVisible()
    await expect(canvas.getByLabelText('Private: stays out of the published mix')).toBeVisible()
    await expect(canvas.getByText(/1 private feed stays out of the published mix/)).toBeVisible()
  },
}
