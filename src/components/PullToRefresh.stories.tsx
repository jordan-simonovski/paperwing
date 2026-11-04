import type { Meta, StoryObj } from '@storybook/react-vite'
import { PullToRefreshScene } from './PullToRefresh'

const meta = {
  title: 'Feed/Pull to refresh',
  component: PullToRefreshScene,
  args: { phase: 'refreshing', motion: true },
  parameters: { layout: 'centered', app: { prefs: { seasonal: false } } },
} satisfies Meta<typeof PullToRefreshScene>
export default meta
type Story = StoryObj<typeof meta>

export const Fetching: Story = {}
export const Pulling: Story = { args: { phase: 'pulling' } }
export const Ready: Story = { args: { phase: 'armed' } }
export const Still: Story = { args: { motion: false } }
