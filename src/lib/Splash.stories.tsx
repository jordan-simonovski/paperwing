import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import { playSplash } from './splash'

// The launch splash covers the whole screen and takes touches, so it has to go however its
// wordmark font fares: a font that fails to load must not leave a blank screen on top of the app.

const meta = { title: 'Chrome/Splash', render: () => <p>The app underneath</p> } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

const overlay = () => [...document.body.children].find((el) => el instanceof HTMLDivElement && el.style.zIndex === '200')

export const FontFailsToLoad: Story = {
  beforeEach: () => {
    const load = document.fonts.load.bind(document.fonts)
    document.fonts.load = () => Promise.reject(new Error('font blocked'))
    return () => void (document.fonts.load = load)
  },
  play: async () => {
    void playSplash({ force: true })
    await waitFor(() => expect(overlay()).toBeUndefined(), { timeout: 3000 })
  },
}
