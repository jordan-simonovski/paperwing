import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'
import type { Story as Item } from '../lib/types'
import { comment, NOW, sampleComments, story, thread } from '../test/fixtures'
import { ItemPane } from './ItemPane'

const hn = story({ key: 'hn-41234567', comments: 187, score: 412 })
const lemmy = story({ key: 'lm-77', source: 'lemmy', sourceLabel: 'c/technology', comments: 64, discussionUrl: 'https://lemmy.world/post/77' })

/** Everything the pane asks for about one story, seeded so it renders without a network. */
const seed = (s: Item, extra: [unknown[], unknown][] = []): [unknown[], unknown][] => [
  [['thread', s.key], thread(s, sampleComments())],
  [['discussions', s.url], [lemmy]],
  [['webmentions', s.url], []],
  [['notes', s.url], []],
  [['coverage', s.key], []],
  [
    ['article', s.url],
    {
      url: s.url,
      title: 'The Web We Lost',
      byline: 'Anil Dash',
      siteName: 'anildash.com',
      length: 7400,
      html: '<p>The tech industry and its press have treated the rise of billion-scale social networks as an unadulterated win for regular people.</p>',
    },
  ],
  ...extra,
]
const at = (key: string, tab = '') => ({ path: '/t/:channel/:itemKey?', url: `/t/for-you/${key}${tab ? `?tab=${tab}` : ''}` })

const meta = {
  title: 'Reading/ItemPane',
  component: ItemPane,
  args: { itemKey: hn.key, onClose: fn(), onOpen: fn() },
  parameters: { app: { queries: seed(hn), route: at(hn.key), fetch: { '/api/summarize?status': { server: true } } } },
  decorators: [
    (Story) => (
      <div className="pane-col open" style={{ height: '100vh', position: 'relative' }}>
        {Story()}
      </div>
    ),
  ],
} satisfies Meta<typeof ItemPane>
export default meta
type Story = StoryObj<typeof meta>

export const Discussion: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: hn.title })).toBeVisible()
    await expect(canvas.getByRole('tab', { name: /Discussion/ })).toHaveAttribute('aria-selected', 'true')
    await expect(canvas.getByText(/RSS readers were/)).toBeVisible()
  },
}

const video = story({ key: 'ln-video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'A talk about the open web' })
/** A story that is a video: it plays here on a tap, and until then nothing from YouTube loads. */
export const VideoStory: Story = {
  args: { itemKey: video.key },
  parameters: { app: { queries: seed(video), route: at(video.key) } },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('button', { name: 'Play A talk about the open web from YouTube' })).toBeVisible()
    await expect(canvasElement.querySelector('iframe')).toBeNull()
  },
}

const warnedVideo = story({ key: 'ln-warned-video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'The finale, reviewed', warning: 'Spoilers' })
/** A story behind a content warning keeps its video behind it too: no picture or player until you choose. */
export const WarnedVideo: Story = {
  args: { itemKey: warnedVideo.key },
  parameters: { app: { queries: seed(warnedVideo), route: at(warnedVideo.key) } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Content warning: Spoilers')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /from YouTube/ })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Show' }))
    await expect(canvas.getByRole('button', { name: 'Play The finale, reviewed from YouTube' })).toBeVisible()
  },
}

const ownVideo = story({
  key: 'ln-own-video',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  title: 'A post with its own clip',
  media: [{ kind: 'video', thumb: '/icon-512.png', playlist: '/clip.mp4', alt: 'A short clip' }],
})
/** A post that carries its own video plays that, not the video its link points to as well. */
export const OwnVideoFirst: Story = {
  args: { itemKey: ownVideo.key },
  parameters: { app: { queries: seed(ownVideo), route: at(ownVideo.key) } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: ownVideo.title })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /from YouTube/ })).toBeNull()
  },
}

export const ArticleTab: Story = {
  parameters: { app: { queries: seed(hn), route: at(hn.key, 'article') } },
}

export const RelatedTab: Story = {
  parameters: { app: { queries: seed(hn), route: at(hn.key, 'related') } },
}

export const SwitchToArticle: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('tab', { name: 'Article' }))
    await expect(await canvas.findByText(/unadulterated win for regular people/)).toBeVisible()
  },
}

/** A Bluesky post with a picture and a quote: its own words sit above the replies. */
export const BlueskyPost: Story = {
  args: { itemKey: 'bs-post' },
  parameters: {
    app: {
      route: at('bs-post'),
      queries: seed(
        story({
          key: 'bs-post',
          source: 'bluesky',
          sourceLabel: 'Bluesky',
          author: 'paperwing.io',
          title: 'Every topic, board, mix and profile on PaperWing now has its own RSS feed.',
          url: null,
          discussionUrl: 'https://bsky.app/profile/paperwing.io/post/1',
          text: '<p>Every topic, board, mix and profile on PaperWing now has its own RSS feed. Bring your reader.</p>',
          media: [{ kind: 'image', thumb: '/icon-512.png', alt: 'Pip', aspect: 1 }],
          quote: { author: 'anildash.com', name: 'Anil Dash', html: '<p>The web we lost is the web we can rebuild.</p>' },
          comments: 3,
          score: 96,
        }),
      ).map(([k, v]) => (k[0] === 'thread' ? [k, { ...(v as object), comments: [comment({ author: 'reader.example', html: '<p>Finally.</p>' })] }] : [k, v])),
    },
  },
}

/** Back for a second visit: replies since are marked New. */
export const NewSinceLastVisit: Story = {
  parameters: { app: { queries: seed(hn), route: at(hn.key), activity: { visits: { [hn.key]: NOW - 45 * 60_000 } } } },
}

/** The thread was deleted where it was posted. */
export const Removed: Story = {
  args: { itemKey: 'hn-1' },
  parameters: { app: { queries: [], route: at('hn-1') } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/didn’t load|isn’t there any more/, {}, { timeout: 5000 })).toBeVisible()
  },
}
