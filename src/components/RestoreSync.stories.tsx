import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'
import { RestoreSync } from './RestoreSync'

const meta = {
  title: 'Settings/RestoreSync',
  component: RestoreSync,
  args: { onRestored: fn() },
  // Whether sync is on is asked once per page (sync.ts remembers it).
  parameters: { app: { fetch: { '/api/sync?status': { enabled: true } } } },
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof RestoreSync>
export default meta
type Story = StoryObj<typeof meta>

export const Offer: Story = {}

export const IncompleteCode: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /sync code/i }))
    await userEvent.type(canvas.getByRole('textbox', { name: 'Sync code' }), 'abcde-fghij')
    await userEvent.keyboard('{Enter}')
    await expect(await canvas.findByText('That isn’t a complete sync code')).toBeVisible()
    await expect(args.onRestored).not.toHaveBeenCalled()
  },
}
