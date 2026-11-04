import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'
import { useComposer } from '../lib/compose'
import { usePrefs } from '../lib/store'
import { toast, useUI } from '../lib/ui'
import { NOW, signedInWithBluesky, story } from '../test/fixtures'
import { BottomNav, Drawer, Help, MobileBar, OfflineBadge, Rail, ThemeToggle, Toaster } from './Chrome'

// Everything around the feed: the sidebar, the phone's top bar, drawer and bottom nav, toasts and
// the keyboard help. They read your follows, accounts and saved items from the stores, so each
// story sets those through parameters.app.

const follows = { followed: ['tech', 'science', 'space', 'web'], seasonal: false }
// The phone's own pieces only show under 900px wide, so their stories run at phone size.
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } }
// The sidebar shows its labels from 1280px; narrower, it collapses to icons.
const desktop = { globals: { viewport: { value: 'desktop', isRotated: false } } }

const meta = {
  title: 'Chrome/Navigation',
  parameters: { app: { prefs: follows } },
} satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

export const Sidebar: Story = {
  render: () => <Rail />,
  ...desktop,
  parameters: { app: { prefs: follows, route: { path: '/t/:channel', url: '/t/for-you' } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'For you' })).toHaveClass('active')
    await expect(canvas.getByRole('link', { name: 'Bluesky feeds' })).toHaveAttribute('href', '/explore/feeds')
    await expect(canvas.queryByRole('link', { name: /Your profile/ })).toBeNull()
  },
}

export const SidebarCollapsed: Story = {
  render: () => <Rail />,
  globals: { viewport: { value: 'tablet', isRotated: true } },
}

export const SidebarSignedIn: Story = {
  render: () => <Rail />,
  ...desktop,
  parameters: {
    app: {
      prefs: {
        ...follows,
        mixes: [{ id: 'aaaaaaaaaaaaa', name: 'Morning briefing', sources: [{ kind: 'topic', id: 'science' }], updatedAt: 1 }],
        communities: [{ name: 'technology@lemmy.world', title: 'Technology' }],
      },
      ...signedInWithBluesky([
        { kind: 'reply', actor: 'anildash.com', text: 'Exactly this.' },
        { kind: 'like', actor: 'molly.wiki' },
      ]),
      library: { items: { 'hn-1': { story: story(), savedAt: NOW, state: 'queue', hasArticle: true, hasThread: true } } },
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('link', { name: /Your profile/ })).toBeVisible()
    await expect(canvas.getByRole('link', { name: /Activity/ })).toHaveTextContent('2')
  },
}

export const TopBarOnAPhone: Story = {
  render: () => <MobileBar />,
  ...phone,
  parameters: { app: { prefs: follows, ...signedInWithBluesky([{ kind: 'mention', actor: 'paperwing.io', text: 'Welcome aboard' }]) } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('link', { name: 'Activity, 1 new' })).toBeVisible()
    // Phones have no command bar: posting is in the top bar.
    await userEvent.click(canvas.getByRole('button', { name: 'Post a link' }))
    await expect(useComposer.getState().target).toMatchObject({ kind: 'post-link' })
    await userEvent.click(canvas.getByRole('button', { name: 'Menu' }))
    await expect(useUI.getState().drawer).toBe(true)
  },
}

export const DrawerOpen: Story = {
  render: () => <Drawer />,
  ...phone,
  parameters: { app: { prefs: follows, ui: { drawer: true } } },
  play: async ({ canvas }) => {
    const close = await canvas.findByRole('button', { name: 'Close menu' })
    await expect(canvas.getByRole('dialog', { name: 'Menu' })).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Bluesky feeds' })).toHaveAttribute('href', '/explore/feeds')
    // The menu deals its rows in, so wait for them to land.
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Toggle dark mode' })).toBeVisible())
    await userEvent.click(close)
    await expect(useUI.getState().drawer).toBe(false)
  },
}

/** "Post a link" in the menu closes it and opens the post sheet. */
export const PostFromTheMenu: Story = {
  render: () => <Drawer />,
  ...phone,
  parameters: { app: { prefs: follows, ui: { drawer: true } } },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Post a link' }))
    await expect(useUI.getState().drawer).toBe(false)
    await expect(useComposer.getState().target).toMatchObject({ kind: 'post-link' })
  },
}

export const BottomNavigation: Story = {
  render: () => <BottomNav />,
  ...phone,
  parameters: { app: { prefs: follows, route: { path: '/saved', url: '/saved' } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: /Saved/ })).toHaveClass('active')
  },
}

export const ThemeSwitch: Story = {
  render: () => <ThemeToggle />,
  parameters: { layout: 'centered', app: { prefs: { theme: 'light' } } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Toggle dark mode' }))
    await expect(usePrefs.getState().theme).toBe('dark')
  },
}

export const Offline: Story = {
  render: () => <OfflineBadge />,
  parameters: { layout: 'centered' },
  beforeEach: () => {
    const online = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine')
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    return () => {
      delete (navigator as { onLine?: boolean }).onLine
      if (online) Object.defineProperty(Navigator.prototype, 'onLine', online)
    }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Offline')).toBeVisible()
  },
}

export const Toasts: Story = {
  render: () => <Toaster />,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div style={{ height: 320 }}>{Story()}</div>],
  play: async ({ canvas }) => {
    toast('Saved to your queue, 6 min read')
    toast('Story hidden', { action: { label: 'Undo', run: () => {} } })
    toast('Couldn’t reach Bluesky. Check your connection and try again, it will retry on its own in a moment.', { tone: 'error' })
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Couldn’t reach Bluesky')
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(canvas.queryByText('Story hidden')).toBeNull())
  },
}

export const KeyboardHelp: Story = {
  render: () => <Help />,
  ...desktop,
  parameters: { app: { ui: { help: true } } },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible())
  },
}
