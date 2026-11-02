import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import type { SpiceGrade } from '../lib/spiceTypes'
import { NOW } from '../test/fixtures'
import { Chillies, SpiceDetail, SpiceMark } from './Spice'

const places = [{ key: 'hn-41234567', source: 'hn' as const, comments: 412 }]
const grade = (level: SpiceGrade['level'], extra: Partial<SpiceGrade> = {}): SpiceGrade => ({
  level,
  heat: level,
  confidence: 0.8,
  split: 0.2,
  pushback: 0.2,
  hostile: 0.1,
  pileOn: 0.1,
  comments: 412,
  at: NOW,
  ...extra,
})
// `enabled: false` keeps the rows from asking the server for grades: the story supplies them.
const graded = (g: SpiceGrade) => ({ app: { spice: { enabled: false, grades: { [places[0].key]: g } } } })

const meta = {
  title: 'Reading/Spice',
  component: SpiceDetail,
  args: { places },
  decorators: [(Story) => <div style={{ padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof SpiceDetail>
export default meta
type Story = StoryObj<typeof meta>

export const AllLevels: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <Chillies level={1} />
      <Chillies level={2} />
      <Chillies level={3} />
    </div>
  ),
}

export const MarkOnARow: Story = {
  render: (args) => <SpiceMark {...args} />,
  parameters: graded(grade(2, { split: 0.7, pushback: 0.6 })),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: /discussion: split into sides, lots of pushback/ })).toBeVisible()
  },
}

export const Flamewar: Story = {
  parameters: graded(grade(3, { split: 0.8, pushback: 0.7, hostile: 0.75, pileOn: 0.65 })),
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { expanded: false })
    await userEvent.click(button)
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByText(/some personal attacks/)).toBeVisible()
  },
}

export const HeatedNoStandoutReason: Story = { parameters: graded(grade(1)) }

/** Calm, or not graded yet: nothing shows. */
export const Calm: Story = { parameters: graded(grade(0)) }

/** Turned off in Settings: nothing shows even when graded. */
export const SpiceOff: Story = { parameters: { app: { ...graded(grade(3)).app, prefs: { spice: false } } } }
