import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import type { FoundFeed } from '../lib/publishers'
import { usePrefs } from '../lib/store'
import { NOW } from '../test/fixtures'
import { OpenWebDirectory } from './OpenWebDirectory'

const blog = (i: number): FoundFeed => ({
  url: `https://writer-${i}.leaflet.pub`,
  title: `Writer ${i}’s notebook`,
  site: `writer-${i}.leaflet.pub`,
  posts: 0,
  latest: NOW - i * 3_600_000,
  format: 'standard',
})
const blogs = Array.from({ length: 15 }, (_, i) => blog(i + 1))

const meta = {
  title: 'Explore/OpenWebDirectory',
  component: OpenWebDirectory,
  parameters: { app: { queries: [[['directory'], blogs]] } },
} satisfies Meta<typeof OpenWebDirectory>
export default meta
type Story = StoryObj<typeof meta>

/** The first twelve, newest post first, then the rest on request. */
export const Listed: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findAllByRole('group')).toHaveLength(12)
    await userEvent.click(canvas.getByRole('button', { name: 'Show all 15' }))
    await expect(canvas.getAllByRole('group')).toHaveLength(15)
  },
}

/** Following one follows its Standard.site publication, not a feed. */
export const Follow: Story = {
  play: async ({ canvas }) => {
    const [first] = await canvas.findAllByRole('button', { name: 'Follow' })
    await userEvent.click(first)
    await expect(usePrefs.getState().customFeeds).toContainEqual(expect.objectContaining({ url: blogs[0].url, format: 'standard' }))
  },
}

/** The list couldn't be read: say so, with a retry. */
export const Unreachable: Story = {
  parameters: { app: { queries: [] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/Couldn’t reach the open web’s blogs/)).toBeVisible()
  },
}

/** Nothing crawled yet: no empty section. */
export const NothingYet: Story = {
  parameters: { app: { queries: [[['directory'], []]] } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('section')).toBeNull()
  },
}
