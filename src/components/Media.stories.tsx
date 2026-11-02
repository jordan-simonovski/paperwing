import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
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
