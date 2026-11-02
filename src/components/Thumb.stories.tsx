import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import { Thumb } from './Thumb'

const meta = {
  title: 'Feed/Thumb',
  component: Thumb,
  args: { src: '/icon-512.png' },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Thumb>
export default meta
type Story = StoryObj<typeof meta>

export const Picture: Story = {}
export const Video: Story = { args: { video: true } }
/** Behind a content warning, in blur mode. */
export const Blurred: Story = { args: { blur: true } }

/** A picture that fails to load takes no room at all. */
export const Broken: Story = {
  args: { src: '/does-not-exist.png' },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.row-thumb')).toBeNull())
  },
}
