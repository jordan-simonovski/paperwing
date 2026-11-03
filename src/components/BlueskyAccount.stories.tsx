import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { READER } from '../test/fixtures'
import { BlueskyAccount } from './BlueskyAccount'

// Every permission PaperWing asks for today: a sign-in with all of them shows no "Allow" prompt.
const FULL_SCOPE = 'atproto blob:image/* rpc:app.bsky.feed.getTimeline rpc:app.bsky.notification.listNotifications repo:io.paperwing.mix repo:io.paperwing.submission repo:io.paperwing.share'

const meta = {
  title: 'Settings/BlueskyAccount',
  component: BlueskyAccount,
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof BlueskyAccount>
export default meta
type Story = StoryObj<typeof meta>

export const SignedOut: Story = {}
export const SignedIn: Story = { parameters: { app: { atproto: { did: READER.did, handle: READER.handle, scope: FULL_SCOPE } } } }
/** Signed in before PaperWing asked for the timeline, notifications and the social records. */
export const NeedsNewPermissions: Story = { parameters: { app: { atproto: { did: READER.did, handle: READER.handle, scope: 'atproto' } } } }
/** Signed in before PaperWing asked to upload pictures: posting them asks for that here. */
export const NeedsPicturePermission: Story = {
  parameters: { app: { atproto: { did: READER.did, handle: READER.handle, scope: FULL_SCOPE.replace(' blob:image/*', '') } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/posting pictures/)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Allow' })).toBeVisible()
  },
}
/** Signing in from the installed iPhone app finishes in Safari, which shows a code to paste back. */
export const WaitingForTheCode: Story = { parameters: { app: { atproto: { pending: true } } } }
