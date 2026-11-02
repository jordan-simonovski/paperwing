import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { usePrefs } from '../lib/store'
import { Palette } from './Palette'

const meta = {
  title: 'Chrome/Palette',
  component: Palette,
  parameters: { app: { ui: { palette: true }, prefs: { followed: ['tech', 'space', 'science'] } } },
} satisfies Meta<typeof Palette>
export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    await expect(canvas.getByRole('option', { name: /Space/ })).toBeInTheDocument()
  },
}

export const FindsATopic: Story = {
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole('combobox'), 'observability')
    await waitFor(() => expect(canvas.getAllByRole('option')[0]).toHaveTextContent(/Observability/))
  },
}

export const SwitchesTheme: Story = {
  parameters: { app: { ui: { palette: true }, prefs: { theme: 'light' } } },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole('combobox'), 'dark mode')
    await userEvent.click(await canvas.findByRole('option', { name: /Switch to dark mode/ }))
    await expect(usePrefs.getState().theme).toBe('dark')
  },
}

export const Closed: Story = { parameters: { app: { ui: { palette: false } } } }

/** Typing what a setting does finds the setting, ahead of topics and searches. */
export const FindsSettings: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.type(page.getByRole('combobox'), 'text size')
    const options = page.getAllByRole('option')
    await expect(options[0]).toHaveTextContent('Text size, theme and density')
  },
}

/** A topic's own name goes to the topic, even when it hides inside a place's words ("ai" in "daily"). */
export const TopicNameFirst: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.type(page.getByRole('combobox'), 'ai')
    await expect(page.getAllByRole('option')[0]).toHaveTextContent(/^AI/)
  },
}

/** A dotted topic word is a topic, not a link to post. */
export const DottedWordsAreNotLinks: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.type(page.getByRole('combobox'), 'node.js')
    await expect(page.getAllByRole('option')[0]).not.toHaveTextContent('Post this link')
    await userEvent.clear(page.getByRole('combobox'))
    await userEvent.type(page.getByRole('combobox'), 'example.com/post')
    await expect(page.getAllByRole('option')[0]).toHaveTextContent('Post this link')
  },
}

/** Several words find a setting by any of its words ("sign in" finds accounts). */
export const SeveralWords: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.type(page.getByRole('combobox'), 'sign in')
    await expect(page.getAllByRole('option')[0]).toHaveTextContent('Accounts and sources')
  },
}

const boardList = [
  {
    uri: 'at://did:plc:uuuuuuuuuuuuuuuuuuuuuuuu/io.paperwing.board/3kitchenboard',
    name: 'Home Cooking',
    description: 'Recipes and kitchen gear',
    owner: 'did:plc:u',
    moderators: [],
    moderatorHandles: {},
    createdAt: '2026-10-01T00:00:00Z',
    active: 4,
  },
  {
    uri: 'at://did:plc:eprq6bm2okrgk6zsoka2wpux/io.paperwing.board/3announcement',
    name: 'Announcements',
    description: 'News from PaperWing',
    owner: 'did:plc:eprq6bm2okrgk6zsoka2wpux',
    moderators: [],
    moderatorHandles: {},
    createdAt: '2026-10-01T00:00:00Z',
    official: true,
  },
]

/** Boards are found by name or what they're about. */
export const FindsABoard: Story = {
  parameters: { app: { ui: { palette: true }, prefs: { followed: ['tech'] }, queries: [[['boards'], boardList]] } },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole('combobox'), 'kitchen')
    await waitFor(() => expect(canvas.getByRole('option', { name: /Home Cooking/ })).toBeInTheDocument())
  },
}

/** Only the server says a board is official: a board that calls itself so in its description gets no badge. */
export const OfficialOnlyByTheBadge: Story = {
  parameters: {
    app: {
      ui: { palette: true },
      prefs: { followed: ['tech'] },
      queries: [
        [
          ['boards'],
          [
            ...boardList,
            { ...boardList[0], uri: 'at://did:plc:uuuuuuuuuuuuuuuuuuuuuuuu/io.paperwing.board/3fakeannounce', name: 'Announcements HQ', description: 'Official, run by PaperWing', official: false },
          ],
        ],
      ],
    },
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole('combobox'), 'announcements')
    const real = await waitFor(() => canvas.getByRole('option', { name: /^Announcements(?! HQ)/ }))
    const fake = canvas.getByRole('option', { name: /Announcements HQ/ })
    await expect(within(real).getByLabelText('Official PaperWing board')).toBeInTheDocument()
    await expect(within(fake).queryByLabelText('Official PaperWing board')).toBeNull()
  },
}
