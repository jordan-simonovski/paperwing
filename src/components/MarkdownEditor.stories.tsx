import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor } from 'storybook/test'
import { MarkdownEditor } from './MarkdownEditor'

/** The editor holding its own text, as a sheet would. */
function Editor({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  return (
    <div className="max-w-xl p-4">
      <MarkdownEditor value={value} onChange={setValue} label="Post" placeholder="Say what’s on your mind" />
    </div>
  )
}

const meta = {
  title: 'Writing/MarkdownEditor',
  component: Editor,
  args: { initial: '' },
} satisfies Meta<typeof Editor>
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}

export const Written: Story = {
  args: { initial: '## What are you reading?\n\nI’m on **Piranesi** and it’s _strange_.\n\n- one\n- two\n\n> A quote\n\n`code` and [a link](https://paperwing.io)' },
}

/** A toolbar button acts on the selected words. */
export const BoldTheSelection: Story = {
  args: { initial: 'make this bold' },
  play: async ({ canvas }) => {
    const box = canvas.getByRole<HTMLTextAreaElement>('textbox', { name: 'Post' })
    box.focus()
    box.setSelectionRange(5, 9)
    await userEvent.click(canvas.getByRole('button', { name: 'Bold' }))
    await waitFor(() => expect(box.value).toBe('make **this** bold'))
  },
}

/** Preview shows it as it will look: a list is a list, and HTML stays text. */
export const Preview: Story = {
  args: { initial: '- one\n- two\n\n<b>not bold</b>' },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('tab', { name: 'Preview' }))
    await expect(canvas.getAllByRole('listitem')).toHaveLength(2)
    await expect(canvas.getByText('<b>not bold</b>')).toBeVisible()
    await expect(canvas.queryByRole('toolbar')).toBeNull()
  },
}
