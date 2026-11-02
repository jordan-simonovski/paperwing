import type { Meta, StoryObj } from '@storybook/react-vite'
import { MastodonSettings } from './MastodonSettings'

const meta = {
  title: 'Settings/MastodonSettings',
  component: MastodonSettings,
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof MastodonSettings>
export default meta
type Story = StoryObj<typeof meta>

export const SignedOut: Story = {}
export const SignedIn: Story = { parameters: { app: { mastodon: { instance: 'hachyderm.io', acct: 'reader', token: 't', scope: 'read write:statuses' } } } }
/** Signed in before PaperWing could post: reading only, with a way to sign in again. */
export const ReadOnly: Story = { parameters: { app: { mastodon: { instance: 'hachyderm.io', acct: 'reader', token: 't', scope: 'read' } } } }
/** From the installed iPhone app: approve on the server, then paste its code back. */
export const PasteTheCode: Story = {
  parameters: {
    app: {
      mastodon: {
        instance: 'hachyderm.io',
        pending: { instance: 'hachyderm.io', verifier: 'v', state: 's', redirect: 'urn:ietf:wg:oauth:2.0:oob', url: 'https://hachyderm.io/oauth/authorize?client_id=x' },
      },
    },
  },
}
