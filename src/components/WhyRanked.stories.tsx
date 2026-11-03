import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { story } from '../test/fixtures'
import { TasteLine, WhyRanked } from './WhyRanked'

const meta = {
  title: 'Reading/WhyRanked',
  component: WhyRanked,
  args: { story: story(), topics: ['web'] },
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof WhyRanked>
export default meta
type Story = StoryObj<typeof meta>

export const RankedUp: Story = {
  parameters: { app: { prefs: { affinity: { 't:web': 2.5, 'd:anildash.com': 1.5 } } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Ranked up: you like/)).toBeVisible()
  },
}

export const RankedDown: Story = {
  args: { story: story({ key: 'hn-reg', title: 'Microsoft fixes another Exchange flaw', url: 'https://www.theregister.com/2026/11/01/exchange/' }), topics: [] },
  parameters: { app: { prefs: { affinity: { 'd:theregister.com': -2.5 } } } },
}

/** With no votes yet there's nothing to say, so nothing renders. */
export const NoTasteYet: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toBe('')
  },
}

/** On a row: one line, only when your taste clearly lifted the story. */
export const RowLiftedByTaste: Story = {
  render: (args) => <TasteLine {...args} />,
  parameters: { app: { prefs: { affinity: { 't:web': 3, 'd:anildash.com': 2.5 } } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^Up for you: you like/)).toBeVisible()
  },
}

/** On a row, a faint taste says nothing: the line is for stories it clearly moved. */
export const RowBarelyMoved: Story = {
  render: (args) => <TasteLine {...args} />,
  parameters: { app: { prefs: { affinity: { 'k:bread': 0.3 } } } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toBe('')
  },
}
