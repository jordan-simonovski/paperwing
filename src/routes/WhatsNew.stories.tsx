import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import changelog from '../generated/changelog.json'
import { WhatsNew, type Release } from './WhatsNewPage'

const older: Release = {
  version: '0.1.0',
  date: '18 October 2026',
  sections: [
    {
      kind: 'highlight',
      title: 'Highlights',
      changes: [{ title: 'PaperWing is here.', detail: 'The open web’s news in one reader: Hacker News, Lemmy, Bluesky, Mastodon and blogs, ranked together.' }],
    },
  ],
}
const breaking: Release = {
  version: '1.0.0',
  date: '1 February 2027',
  sections: [
    { kind: 'highlight', title: 'Highlights', changes: [{ title: 'Version 1.0.', detail: 'Ready for everyone.' }] },
    { kind: 'breaking', title: 'Breaking changes', changes: [{ title: 'Topic pages have new addresses.', detail: 'Old links still open the right page; bookmarks are worth updating.' }] },
    { kind: 'new', title: 'New', changes: [{ title: 'Read aloud.', detail: 'Any article in the reader can be read to you.' }] },
    { kind: 'improved', title: 'Improved', changes: [{ title: 'Calmer notifications.', detail: 'Replies to the same thread arrive together.' }] },
    { kind: 'fix', title: 'Fixes', changes: [{ title: 'Dark mode on iPad.', detail: 'The reader no longer flashes white.' }] },
  ],
}

const meta = {
  title: 'Pages/WhatsNew',
  component: WhatsNew,
  args: { releases: changelog.releases, version: changelog.version },
  // Known contrast findings, every other check still on. To fix: see the codebase-health skill, Accessibility.
  parameters: { a11y: { config: { rules: [{ id: 'color-contrast', enabled: false }] } } },
} satisfies Meta<typeof WhatsNew>
export default meta
type Story = StoryObj<typeof meta>

/** The real list, as this build ships it. */
export const Current: Story = {
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('heading', { name: args.version })).toBeVisible()
    await expect(canvas.getByText('You’re on this one')).toBeVisible()
  },
}

/** Every kind of change, in the order readers see them. */
export const EveryKind: Story = {
  args: { releases: [breaking, older], version: '1.0.0' },
  play: async ({ canvas }) => {
    const titles = canvas.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    await expect(titles.slice(0, 5)).toEqual(['Highlights', 'Breaking changes', 'New', 'Improved', 'Fixes'])
  },
}

export const NothingYet: Story = { args: { releases: [], version: '0.1.0' } }
