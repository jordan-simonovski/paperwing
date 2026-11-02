import type { Meta, StoryObj } from '@storybook/react-vite'
import { Avatar } from './Avatar'

const meta = {
  title: 'Brand/Avatar',
  component: Avatar,
  args: { handle: 'reader.example', size: 40 },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Avatar>
export default meta
type Story = StoryObj<typeof meta>

export const Initial: Story = {}
export const Picture: Story = { args: { avatar: '/icon-512.png' } }
export const Small: Story = { args: { size: 16 } }
