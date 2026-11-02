import type { Meta, StoryObj } from '@storybook/react-vite'
import { Pip } from './Pip'

const meta = {
  title: 'Brand/Pip',
  component: Pip,
  args: { variant: 'full', className: 'block size-40', title: 'Pip, the paper owl' },
  // Seasonal hats depend on today's date: off by default so the story looks the same every day.
  parameters: { layout: 'centered', app: { prefs: { seasonal: false } } },
} satisfies Meta<typeof Pip>
export default meta
type Story = StoryObj<typeof meta>

export const Full: Story = {}
export const Head: Story = { args: { variant: 'head', className: 'block size-24' } }
export const Decorative: Story = { args: { title: undefined } }
/** Today's edition is finished: the book shut, eyes closed in a smile. */
export const Done: Story = { args: { variant: 'done', title: 'Pip, done reading' } }
