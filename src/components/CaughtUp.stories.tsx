import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { CaughtUp } from './CaughtUp'

const meta = {
  title: 'Feed/CaughtUp',
  component: CaughtUp,
  decorators: [(Story) => <div style={{ maxWidth: 640 }}>{Story()}</div>],
} satisfies Meta<typeof CaughtUp>
export default meta
type Story = StoryObj<typeof meta>

/** Where Hot turns to stories you've seen on earlier visits. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('separator', { name: 'You’re caught up' })).toBeVisible()
    await expect(canvas.getByText(/Below: mostly what you’ve seen/)).toBeVisible()
  },
}
