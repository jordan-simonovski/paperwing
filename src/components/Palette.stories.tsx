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
