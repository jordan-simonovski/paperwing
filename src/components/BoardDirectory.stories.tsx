import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import type { BoardView } from '../lib/boards'
import { BoardDirectory } from './BoardDirectory'

const board = (name: string, extra: Partial<BoardView> = {}): BoardView => ({
  uri: `at://did:plc:uuuuuuuuuuuuuuuuuuuuuuuu/io.paperwing.board/${(name.toLowerCase().replace(/[^a-z]/g, '') + 'aaaaaaaaaaaaa').slice(0, 13)}`,
  name,
  owner: 'did:plc:uuuuuuuuuuuuuuuuuuuuuuuu',
  ownerHandle: 'someone.example',
  moderators: [],
  moderatorHandles: {},
  createdAt: '2026-10-01T00:00:00Z',
  ...extra,
})
const boards = [
  board('Quiet corner', { active: 0, createdAt: '2026-10-30T00:00:00Z' }),
  board('Home Cooking', { description: 'Recipes, techniques and kitchen gear', active: 14 }),
  board('Announcements', { owner: 'did:plc:eprq6bm2okrgk6zsoka2wpux', ownerHandle: 'paperwing.io', description: 'News from PaperWing itself', official: true, active: 1 }),
  board('Sourdough', { description: 'Bread and starters', active: 3 }),
]

const meta = {
  title: 'Explore/BoardDirectory',
  component: BoardDirectory,
  parameters: { app: { queries: [[['boards'], boards]] } },
} satisfies Meta<typeof BoardDirectory>
export default meta
type Story = StoryObj<typeof meta>

const names = (el: HTMLElement) =>
  within(el)
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent?.replace('Official', '').trim())

/** The official board first, then the busiest this week. */
export const MostActive: Story = {
  play: async ({ canvasElement, canvas }) => {
    await canvas.findByText('Home Cooking')
    await expect(names(canvasElement)).toEqual(['Announcements', 'Home Cooking', 'Sourdough', 'Quiet corner'])
    await expect(canvas.getByText(/14 people posting this week/)).toBeVisible()
    await expect(canvas.getAllByLabelText('Official PaperWing board')).toHaveLength(1)
  },
}

/** Newest first instead. */
export const Newest: Story = {
  play: async ({ canvasElement, canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'New' }))
    await expect(names(canvasElement)[0]).toBe('Quiet corner')
  },
}

/** Finding one by name or what it's about. */
export const Search: Story = {
  play: async ({ canvasElement, canvas }) => {
    await userEvent.type(await canvas.findByRole('searchbox', { name: 'Find a board' }), 'kitchen')
    await expect(names(canvasElement)).toEqual(['Home Cooking'])
    await userEvent.clear(canvas.getByRole('searchbox', { name: 'Find a board' }))
    await userEvent.type(canvas.getByRole('searchbox', { name: 'Find a board' }), 'knitting')
    await expect(canvas.getByText('No board matches “knitting”.')).toBeVisible()
  },
}
