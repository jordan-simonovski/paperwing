import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'
import { VideoEmbed } from './VideoEmbed'

const poster = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="%232f4d7d"/></svg>'

const meta = {
  title: 'Story/VideoEmbed',
  component: VideoEmbed,
  args: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'A talk about feeds', thumb: poster },
  decorators: [(Story) => <div style={{ maxWidth: 704, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof VideoEmbed>
export default meta
type Story = StoryObj<typeof meta>

/** Before the tap: a picture and a play button, saying where it will play from. Nothing from YouTube runs yet. */
export const YouTube: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('button', { name: 'Play A talk about feeds from YouTube' })).toBeVisible()
    await expect(canvas.getByText(/Plays from YouTube when you press play/)).toBeVisible()
    await expect(canvasElement.querySelector('iframe')).toBeNull()
  },
}

/** A preview picture that won't load leaves just the play button, never a broken image. */
export const PictureMissing: Story = {
  args: { thumb: '/api/feed?src=og&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ' },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('img')).toBeNull())
  },
}

export const Vimeo: Story = { args: { url: 'https://vimeo.com/76979871', thumb: undefined } }

/** A PeerTube video its uploader marked sensitive: it's covered until you choose to see it. */
export const PeerTubeSensitive: Story = {
  args: { url: 'https://tilvids.com/w/kkGMgK9ZtnKfYAgnEtQxbv', thumb: undefined },
  parameters: { app: { fetch: { 'tilvids.com/api/v1/videos/': { nsfw: true, files: [{ resolution: { id: 480 }, fileUrl: 'https://tilvids.com/x-480.mp4' }] } } } },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Play A talk about feeds from tilvids\.com/ }))
    await expect(await canvas.findByText(/marked this video sensitive/)).toBeVisible()
    await expect(canvasElement.querySelector('video')).toBeNull()
  },
}

/** A PeerTube server that won't say where the video is: it says so and links there instead. */
export const PeerTubeUnplayable: Story = {
  args: { url: 'https://tilvids.com/w/kkGMgK9ZtnKfYAgnEtQxbv', thumb: undefined },
  parameters: { app: { fetch: { 'tilvids.com/api/v1/videos/': { isLive: true, files: [] } } } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Play A talk about feeds from tilvids\.com/ }))
    await expect(await canvas.findByText(/can’t be played here/)).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Watch on tilvids.com' })).toHaveAttribute('href', 'https://tilvids.com/w/kkGMgK9ZtnKfYAgnEtQxbv')
  },
}

/** Not a video PaperWing can play: nothing at all. */
export const NotAVideo: Story = {
  args: { url: 'https://example.com/an-article' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('button')).toBeNull()
  },
}
