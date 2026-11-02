import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import { ownKey } from '../lib/summary'
import { SummarySettings } from './SummarySettings'

// Whether the deployment has its own key is asked once per page load (summary.ts remembers the
// answer), so every story here sees the same answer: the first one's.
const meta = {
  title: 'Settings/SummarySettings',
  component: SummarySettings,
  parameters: { app: { fetch: { '/api/summarize?status': { server: true, model: 'claude' } } } },
  beforeEach: () => {
    ownKey.set(undefined)
    return () => ownKey.set(undefined)
  },
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof SummarySettings>
export default meta
type Story = StoryObj<typeof meta>

export const NoKeyOfYourOwn: Story = {}

export const YourOwnKey: Story = { beforeEach: () => ownKey.set('sk-ant-example') }

export const RejectsSomethingElse: Story = {
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText('Your Anthropic API key'), 'hello')
    await userEvent.click(canvas.getByRole('button', { name: 'Use my key' }))
    await expect(ownKey.get()).toBeUndefined()
  },
}

export const SavesAKey: Story = {
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText('Your Anthropic API key'), 'sk-ant-example')
    await userEvent.click(canvas.getByRole('button', { name: 'Use my key' }))
    await expect(await canvas.findByRole('button', { name: 'Remove my key' })).toBeVisible()
  },
}
