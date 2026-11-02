import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { BoardMatches } from './BoardMatches'

const boards = [
  {
    uri: 'at://did:plc:uuuuuuuuuuuuuuuuuuuuuuuu/io.paperwing.board/3kitchenboard',
    name: 'Home Cooking',
    description: 'Recipes and kitchen gear',
    owner: 'did:plc:u',
    moderators: [],
    moderatorHandles: {},
    createdAt: '2026-10-01T00:00:00Z',
  },
  {
    uri: 'at://did:plc:eprq6bm2okrgk6zsoka2wpux/io.paperwing.board/3announcement',
    name: 'Announcements',
    owner: 'did:plc:eprq6bm2okrgk6zsoka2wpux',
    moderators: [],
    moderatorHandles: {},
    createdAt: '2026-10-01T00:00:00Z',
    official: true,
  },
]

const meta = {
  title: 'Search/BoardMatches',
  component: BoardMatches,
  args: { query: 'recipes' },
  parameters: { app: { queries: [[['boards'], boards]] } },
} satisfies Meta<typeof BoardMatches>
export default meta
type Story = StoryObj<typeof meta>

/** A search for what a board is about finds it. */
export const Found: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('link', { name: /Home Cooking/ })).toHaveAttribute('href', '/c/did:plc:uuuuuuuuuuuuuuuuuuuuuuuu/3kitchenboard')
  },
}

/** PaperWing's own board, marked. */
export const Official: Story = {
  args: { query: 'announce' },
  play: async ({ canvas }) => {
    await expect(await canvas.findByLabelText('Official PaperWing board')).toBeVisible()
  },
}

/** Nothing matches: nothing shown. */
export const NoMatch: Story = {
  args: { query: 'knitting' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[aria-label="Boards"]')).toBeNull()
  },
}
