import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'
import { NOW } from '../test/fixtures'
import { QuoteCard } from './QuoteCard'

const meta = {
  title: 'Reading/QuoteCard',
  component: QuoteCard,
  args: {
    onOpen: fn(),
    quote: {
      key: 'bs-quoted',
      author: 'anildash.com',
      name: 'Anil Dash',
      html: '<p>The tech industry and its press have treated the rise of billion-scale social networks as an unadulterated win for regular people. They’ve lost a lot along the way.</p>',
      url: 'https://bsky.app/profile/anildash.com/post/3k',
      createdAt: NOW - 5 * 3_600_000,
    },
  },
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof QuoteCard>
export default meta
type Story = StoryObj<typeof meta>

export const Post: Story = {}

export const WithLinkCard: Story = {
  args: {
    quote: {
      author: 'quantamagazine.bsky.social',
      name: 'Quanta Magazine',
      html: '<p>A new proof smooths out the math of melting.</p>',
      link: { url: 'https://www.quantamagazine.org/a-new-proof-smooths-out-the-math-of-melting/', title: 'A New Proof Smooths Out the Math of Melting' },
    },
  },
}

export const WithPicture: Story = {
  args: { quote: { author: 'paperwing.io', name: 'PaperWing', html: '<p>Pip, reading.</p>', media: [{ kind: 'image', thumb: '/icon-512.png', alt: 'Pip the paper owl', aspect: 1 }] } },
}

export const Unavailable: Story = { args: { quote: { author: 'someone.bsky.social', html: '', gone: true } } }

export const OpensInTheReader: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('link', { name: /Anil Dash/ }))
    await expect(args.onOpen).toHaveBeenCalledWith('bs-quoted')
  },
}
