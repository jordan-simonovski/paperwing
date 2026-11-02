import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor } from 'storybook/test'
import { Sheet } from './Sheet'

const meta = {
  title: 'Chrome/Sheet',
  component: Sheet,
  args: { open: true, side: 'bottom', label: 'Example sheet', onClose: fn(), children: null },
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: (args) => (
    <Sheet {...args}>
      <div className="space-y-3 p-4">
        <h2 className="text-[1.0625rem] font-bold">Add to a mix</h2>
        <p className="text-[0.875rem] text-ink-3">A mix is your own channel, made from any blogs, topics, communities and feeds.</p>
        <button className="btn">Morning briefing</button>
      </div>
    </Sheet>
  ),
} satisfies Meta<typeof Sheet>
export default meta
type Story = StoryObj<typeof meta>

export const FromTheBottom: Story = {}
export const FromTheLeft: Story = { args: { side: 'left', label: 'Menu' } }

export const EscapeCloses: Story = {
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole('dialog', { name: 'Example sheet' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect(args.onClose).toHaveBeenCalled()
  },
}

/** Opened from a button, closed by tapping outside it. */
export const OpenAndClose: Story = {
  render: function Render(args) {
    const [open, setOpen] = useState(false)
    return (
      <div className="p-4">
        <button className="btn" onClick={() => setOpen(true)}>
          Open
        </button>
        <Sheet {...args} open={open} onClose={() => setOpen(false)}>
          <p className="p-4">Tap outside to close.</p>
        </Sheet>
      </div>
    )
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(canvas.getByRole('dialog')).toBeVisible())
    await userEvent.click(canvasElement.querySelector('.sheet-backdrop')!)
    await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull())
  },
}
