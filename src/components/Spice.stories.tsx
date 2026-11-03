import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'
import type { SpiceGrade, SpiceInsights } from '../lib/spiceTypes'
import { NOW } from '../test/fixtures'
import { Chillies, SpiceDetail, SpiceMark, ThreadNotes } from './Spice'

const places = [{ key: 'hn-41234567', source: 'hn' as const, comments: 412 }]
const grade = (level: SpiceGrade['level'], extra: Partial<SpiceGrade> = {}): SpiceGrade => ({
  level,
  heat: level,
  confidence: 0.8,
  split: 0.2,
  pushback: 0.2,
  sharp: 0.2,
  flame: 0,
  hostile: 0,
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
  parameters: graded(grade(3, { sharp: 0.9, flame: 0.5, split: 0.8, pushback: 0.7, hostile: 3 })),
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

// What the discussion is like, from the open thread's own grade.
const insights = (extra: Partial<SpiceInsights>): SpiceInsights => ({ sad: 0.1, delighted: 0.1, warm: 0.1, political: 0.1, disputed: [], answers: [], ...extra })
const jump = fn()
const notes: Story = { render: () => <ThreadNotes story={places[0]} onJump={jump} /> }

export const SadAndWholesome: Story = {
  ...notes,
  parameters: graded(grade(0, { insights: insights({ sad: 0.98, warm: 0.8 }) })),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Sad')).toBeVisible()
    await expect(canvas.getByText('Wholesome')).toBeVisible()
    await expect(canvas.queryByText('Happy')).toBeNull()
  },
}

export const DisputedHeadline: Story = {
  ...notes,
  parameters: graded(
    grade(2, {
      insights: insights({
        political: 0.95,
        disputed: [
          { id: '41234601', author: 'pg' },
          { id: '41234655', author: 'dang' },
        ],
      }),
    }),
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Politically charged')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Disputed' }))
    await expect(canvas.getByText(/headline is wrong/)).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'dang' }))
    await expect(jump).toHaveBeenCalledWith('41234655')
  },
}

export const AnsweredQuestion: Story = {
  ...notes,
  parameters: graded(grade(0, { insights: insights({ answers: [{ id: '41234700', author: 'tptacek' }] }) })),
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Answered' })
    await userEvent.click(button)
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByRole('button', { name: 'tptacek' })).toBeVisible()
  },
}

// Nothing Jev is sure of: no notes at all.
export const NothingToNote: Story = {
  ...notes,
  parameters: graded(grade(0, { insights: insights({}) })),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.pill')).toBeNull()
  },
}
