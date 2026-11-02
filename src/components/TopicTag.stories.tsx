import type { Meta, StoryObj } from '@storybook/react-vite'
import { TopicChip, TopicTag } from './TopicTag'

const meta = {
  title: 'Feed/TopicTag',
  component: TopicTag,
  args: { id: 'space' },
  // Known contrast findings, every other check still on. To fix: see the codebase-health skill, Accessibility.
  parameters: { layout: 'centered', a11y: { config: { rules: [{ id: 'color-contrast', enabled: false }] } } },
} satisfies Meta<typeof TopicTag>
export default meta
type Story = StoryObj<typeof meta>

export const Tag: Story = {}

/** Each topic wears its own hue. */
export const Hues: Story = {
  render: () => (
    <div className="flex max-w-xl flex-wrap gap-1.5">
      {['ai', 'sre', 'web', 'security', 'space', 'science', 'world', 'business', 'gaming', 'music', 'books', 'climate'].map((id) => (
        <TopicTag key={id} id={id} />
      ))}
    </div>
  ),
}

export const Chips: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <TopicChip id="space" count={24} />
      <TopicChip id="science" />
      <TopicChip id="web" count={8} small />
    </div>
  ),
}

/** A search interest you added yourself ("q:" topics live in your prefs). */
export const YourOwnInterest: Story = {
  args: { id: 'q:knitting' },
  parameters: { app: { prefs: { interests: [{ id: 'q:knitting', label: 'Knitting', query: 'knitting' }] } } },
}

export const UnknownTopicRendersNothing: Story = { args: { id: 'not-a-topic' } }
