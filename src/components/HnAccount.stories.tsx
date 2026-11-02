import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'
import { useHn } from '../lib/hnAccount'
import { HnAccount } from './HnAccount'

const meta = {
  title: 'Settings/HnAccount',
  component: HnAccount,
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof HnAccount>
export default meta
type Story = StoryObj<typeof meta>

export const SignedOut: Story = {}
export const SignedIn: Story = { parameters: { app: { hn: { user: 'pg', cookie: 'x' } } } }

export const SignIn: Story = {
  parameters: { app: { fetch: { '/api/hn': { user: 'dang', cookie: 'secret' } } } },
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Sign in' })
    await expect(button).toBeDisabled()
    await userEvent.type(canvas.getByRole('textbox', { name: 'Hacker News username' }), 'dang')
    await userEvent.type(canvas.getByLabelText('Hacker News password'), 'hunter2')
    await userEvent.click(button)
    await waitFor(() => expect(useHn.getState().user).toBe('dang'))
    await expect(await canvas.findByText(/Signed in as/)).toBeVisible()
  },
}
