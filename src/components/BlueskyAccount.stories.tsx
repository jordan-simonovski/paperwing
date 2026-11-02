import type { Meta, StoryObj } from '@storybook/react-vite'
import { READER } from '../test/fixtures'
import { BlueskyAccount } from './BlueskyAccount'

// Every permission PaperWing asks for today: a sign-in with all of them shows no "Allow" prompt.
const FULL_SCOPE = 'atproto rpc:app.bsky.feed.getTimeline rpc:app.bsky.notification.listNotifications repo:io.paperwing.mix repo:io.paperwing.submission repo:io.paperwing.share'

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
/** Signing in from the installed iPhone app finishes in Safari, which shows a code to paste back. */
export const WaitingForTheCode: Story = { parameters: { app: { atproto: { pending: true } } } }
