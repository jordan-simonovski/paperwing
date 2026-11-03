import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'
import { MAX_FEEDS } from '../lib/publishers'
import { usePrefs } from '../lib/store'
import { OpmlTools } from './OpmlTools'

/** A FreshRSS export: two folders, feeds it can read, scraped and JSON feeds, and two private ones. */
const FRESHRSS = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0" xmlns:frss="https://freshrss.org/opml">
  <head><title>FreshRSS</title></head>
  <body>
    <outline text="Engineering">
      <outline text="Julia Evans" type="rss" xmlUrl="https://jvns.ca/atom.xml" htmlUrl="https://jvns.ca/"/>
      <outline text="Dan Luu" type="rss" xmlUrl="https://danluu.com/atom.xml" htmlUrl="https://danluu.com/"/>
      <outline text="Scraped news" type="HTML+XPath" xmlUrl="https://news.example/latest" frss:xPathItem="//li[position()>1]"/>
      <outline text="A JSON feed" type="JSONFeed" xmlUrl="https://json.example/feed.json"/>
    </outline>
    <outline text="Friends">
      <outline text="Sam" type="rss" xmlUrl="https://sam.example/rss" htmlUrl="https://sam.example/"/>
      <outline text="Paid letter" type="rss" xmlUrl="https://letters.example/feed?token=s3cret"/>
    </outline>
  </body>
</opml>`
const file = () => new File([FRESHRSS], 'freshrss.opml', { type: 'text/x-opml' })

const meta = {
  title: 'Settings/OpmlTools',
  component: OpmlTools,
  parameters: { app: { prefs: { customFeeds: [] } } },
  decorators: [(Story) => <div style={{ maxWidth: 560, padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof OpmlTools>
export default meta
type Story = StoryObj<typeof meta>

/** Bringing feeds from FreshRSS: their folders come too, and it says what it left out and why. */
export const FromFreshRss: Story = {
  play: async ({ canvas }) => {
    await userEvent.upload(canvas.getByLabelText('Choose an OPML file'), file())
    const said = await canvas.findByRole('status')
    await expect(said).toHaveTextContent('Following 3 new feeds, in 2 folders.')
    await expect(said).toHaveTextContent('2 skipped: PaperWing reads RSS and Atom feeds')
    await expect(said).toHaveTextContent('1 skipped: its address holds a password or token')
    await waitFor(() => expect(usePrefs.getState().customFeeds.map((f) => f.folder)).toEqual(['Engineering', 'Engineering', 'Friends']))
  },
}

/** With your feeds nearly full, it follows what fits and says how many it left out. */
export const NearlyFull: Story = {
  parameters: { app: { prefs: { customFeeds: Array.from({ length: MAX_FEEDS - 1 }, (_, n) => ({ url: `https://blog${n}.example/feed`, label: `Blog ${n}` })) } } },
  play: async ({ canvas }) => {
    await userEvent.upload(canvas.getByLabelText('Choose an OPML file'), file())
    const said = await canvas.findByRole('status')
    await expect(said).toHaveTextContent('Following 1 new feed, in 1 folder.')
    await expect(said).toHaveTextContent(`2 left out: you follow ${MAX_FEEDS} feeds, as many as PaperWing keeps.`)
  },
}

/** Importing what you already follow says so, and still says what it would have left out. */
export const AlreadyFollowing: Story = {
  parameters: {
    app: {
      prefs: {
        customFeeds: ['https://jvns.ca/atom.xml', 'https://danluu.com/atom.xml', 'https://sam.example/rss'].map((url) => ({ url, label: url })),
      },
    },
  },
  play: async ({ canvas }) => {
    await userEvent.upload(canvas.getByLabelText('Choose an OPML file'), file())
    const said = await canvas.findByRole('status')
    await expect(said).toHaveTextContent('You already follow all of those.')
    await expect(said).toHaveTextContent('2 skipped: PaperWing reads RSS and Atom feeds')
    await expect(usePrefs.getState().customFeeds).toHaveLength(3)
  },
}
