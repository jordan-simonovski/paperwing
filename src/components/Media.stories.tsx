import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { MediaGallery } from './Media'

const img = (alt: string) => ({ kind: 'image' as const, thumb: '/icon-512.png', full: '/icon-512.png', alt, aspect: 1 })

const meta = {
  title: 'Reading/MediaGallery',
  component: MediaGallery,
  args: { media: [img('Pip the paper owl')] },
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof MediaGallery>
export default meta
type Story = StoryObj<typeof meta>

export const OneImage: Story = {}
export const TwoImages: Story = { args: { media: [img('First'), img('Second')] } }
export const ThreeImages: Story = { args: { media: [img('First'), img('Second'), img('Third')] } }
export const FourImages: Story = { args: { media: [img('First'), img('Second'), img('Third'), img('Fourth')] } }
export const Compact: Story = { args: { media: [img('First'), img('Second')], compact: true } }

export const BrowseImages: Story = {
  args: { media: [img('First'), img('Second'), img('Third')] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    const opener = canvas.getByRole('link', { name: 'Open image 2 of 3: Second' })
    await userEvent.click(opener)
    const viewer = within(await page.findByRole('dialog', { name: 'Image viewer' }))
    await expect(viewer.getByRole('status')).toHaveTextContent('2 of 3')
    await userEvent.click(viewer.getByRole('button', { name: 'Next image' }))
    await expect(await viewer.findByRole('img', { name: 'Third' })).toBeVisible()
    await expect(viewer.getByRole('button', { name: 'Next image' })).toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    await expect(await viewer.findByRole('img', { name: 'First' })).toBeVisible()
    await expect(viewer.getByRole('button', { name: 'Previous image' })).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(viewer.getByRole('button', { name: 'Close image viewer' }))
    await expect(page.queryByRole('dialog')).not.toBeInTheDocument()
    await expect(opener).toHaveFocus()
  },
}

export const SingleImageViewer: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('link', { name: /Open image 1 of 1/ }))
    const viewer = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'))
    await expect(viewer.queryByRole('button', { name: 'Next image' })).not.toBeInTheDocument()
    await expect(await viewer.findByRole('img', { name: 'Pip the paper owl' })).toBeVisible()
  },
}

export const MoreThanFourImages: Story = {
  args: { media: ['First', 'Second', 'Third', 'Fourth', 'Fifth'].map(img) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('+1')).toBeVisible()
    await userEvent.click(canvas.getByRole('link', { name: 'Open image 4 of 5: Fourth' }))
    const viewer = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'))
    await userEvent.click(viewer.getByRole('button', { name: 'Next image' }))
    await expect(await viewer.findByRole('img', { name: 'Fifth' })).toBeVisible()
  },
}

export const UnavailableImage: Story = {
  args: { media: [{ ...img('A mountain at sunrise'), full: 'data:image/png;base64,broken' }, img('Second')] },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('link', { name: /Open image 1 of 2/ }))
    const viewer = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'))
    await expect(await viewer.findByText('This image couldn’t load.')).toBeVisible()
    const retry = viewer.getByRole('button', { name: 'Try again' })
    await expect(retry).toBeVisible()
    retry.focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(await viewer.findByRole('img', { name: 'Second' })).toBeVisible()
    await expect(canvasElement.ownerDocument.querySelector('dialog')?.contains(canvasElement.ownerDocument.activeElement)).toBe(true)
  },
}

/** Bluesky's HLS video: plays in place where the browser can (Safari, recent Chromium), else the poster links to the post. */
export const BlueskyVideo: Story = {
  args: { media: [{ kind: 'video', thumb: '/icon-512.png', playlist: 'https://video.bsky.app/watch/x/playlist.m3u8', alt: 'A short clip' }], href: 'https://bsky.app/profile/paperwing.io/post/1' },
}

/** A plain video file (Mastodon) plays anywhere. */
export const PlainVideo: Story = {
  args: { media: [{ kind: 'video', thumb: '/icon-512.png', playlist: '/clip.mp4', alt: 'A short clip', aspect: 16 / 9 }] },
  play: async ({ canvasElement }) => {
    const video = canvasElement.querySelector('video')
    await expect(video).not.toBeNull()
    await expect(video).toHaveAttribute('controls')
  },
}
