import type { Meta, StoryObj } from '@storybook/react-vite'
import { Mark, Wordmark } from './Chrome'

const meta = {
  title: 'Brand/Wordmark',
  component: Wordmark,
  parameters: { layout: 'centered', app: { prefs: { seasonal: false } } },
} satisfies Meta<typeof Wordmark>
export default meta
type Story = StoryObj<typeof meta>

export const Full: Story = {}
export const Short: Story = { args: { short: true } }
export const MarkOnly: Story = { render: () => <Mark /> }
