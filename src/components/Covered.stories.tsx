import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import { Covered } from './Covered'

const meta = {
  title: 'Reading/Covered',
  component: Covered,
  args: {
    warning: 'Graphic media (flagged by Bluesky Moderation)',
    children: <p className="text-[0.9375rem]">Photos from the scene of the crash, taken by a passenger.</p>,
  },
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof Covered>
export default meta
type Story = StoryObj<typeof meta>

export const BehindAWarning: Story = {}

export const NoWarning: Story = { args: { warning: undefined } }

export const ShowReveals: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/Photos from the scene/)).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Show' }))
    await expect(canvas.getByText(/Photos from the scene/)).toBeVisible()
  },
}
