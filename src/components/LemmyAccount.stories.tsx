import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import { LemmyAccount } from './LemmyAccount'

const meta = {
  title: 'Settings/LemmyAccount',
  component: LemmyAccount,
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof LemmyAccount>
export default meta
type Story = StoryObj<typeof meta>

export const SignedOut: Story = {}
export const SignedIn: Story = { parameters: { app: { lemmy: { instance: 'lemmy.world', user: 'reader', jwt: 'x' } } } }

/** An account with two-factor codes: the server asks for one, and the form grows a field for it. */
export const AsksForATwoFactorCode: Story = {
  parameters: { app: { fetch: { '/api/v3/user/login': { error: 'missing_totp_token' } } } },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole('textbox', { name: 'Lemmy username' }), 'reader')
    await userEvent.type(canvas.getByLabelText('Lemmy password'), 'hunter2')
    await userEvent.click(canvas.getByRole('button', { name: /Sign in/ }))
    await expect(await canvas.findByRole('textbox', { name: 'Two-factor code' })).toBeVisible()
  },
}
