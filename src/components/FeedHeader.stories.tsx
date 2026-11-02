import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { usePrefs } from '../lib/store'
import { channelFor, sampleStories, statusesFor } from '../test/fixtures'
import { FeedHeader, SourceStatusList } from './FeedHeader'

const space = channelFor('space')
const forYou = channelFor('for-you')
const hn = channelFor('hn', undefined, 'top')

const meta = {
  title: 'Feed/FeedHeader',
  component: FeedHeader,
  args: {
    channel: space,
    stories: sampleStories(),
    statuses: statusesFor(space),
    sort: 'hot',
    onSort: fn(),
    onVariant: fn(),
    onSourceFilter: fn(),
    onKindFilter: fn(),
    fetching: false,
    onRefresh: fn(),
  },
  parameters: { app: { prefs: { followed: ['tech', 'science', 'space', 'web'] } } },
  decorators: [(Story) => <div style={{ maxWidth: 720 }}>{Story()}</div>],
} satisfies Meta<typeof FeedHeader>
export default meta
type Story = StoryObj<typeof meta>

export const Topic: Story = {}
export const NotYetFollowed: Story = { parameters: { app: { prefs: { followed: ['tech'] } } } }
export const ForYou: Story = { args: { channel: forYou, statuses: statusesFor(forYou) } }
export const LatestFirst: Story = { args: { sort: 'new' } }
export const SourceWithVariants: Story = { args: { channel: hn, statuses: statusesFor(hn), variant: 'top' } }

export const Loading: Story = { args: { stories: [], statuses: statusesFor(space, { loading: 4 }), fetching: true } }

export const SomeSourcesFailed: Story = {
  args: { statuses: statusesFor(space, { failed: 2 }) },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: '2 sources failed' }))
    // The details go to a toast (outside this component).
  },
}

export const ChangingTheSort: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Latest' }))
    await expect(args.onSort).toHaveBeenCalledWith('new')
  },
}

export const PickingAVariant: Story = {
  args: { channel: hn, statuses: statusesFor(hn), variant: 'top' },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Ask' }))
    await expect(args.onVariant).toHaveBeenCalledWith('ask')
  },
}

export const FollowingTheTopic: Story = {
  parameters: { app: { prefs: { followed: ['tech'] } } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Follow/, pressed: false }))
    await expect(usePrefs.getState().followed).toContain('space')
  },
}

/** On a phone the source and kind filters move into a sheet. */
export const FilterSheetOnAPhone: Story = {
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  play: async ({ args, canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Filter' }))
    const sheet = within(canvasElement.ownerDocument.body).getByRole('dialog', { name: 'Filter stories' })
    await waitFor(() => expect(sheet).toBeVisible())
    await userEvent.click(within(sheet).getByRole('button', { name: /Blogs/ }))
    await expect(args.onSourceFilter).toHaveBeenCalledWith('rss')
  },
}

export const StatusList: StoryObj<typeof SourceStatusList> = {
  render: () => <SourceStatusList statuses={statusesFor(space, { failed: 1, loading: 1 })} />,
}

/** A topic shows the community boards about it. */
export const BoardsAboutTheTopic: Story = {
  parameters: {
    app: {
      queries: [
        [
          ['boards'],
          [
            {
              uri: 'at://did:plc:uuuuuuuuuuuuuuuuuuuuuuuu/io.paperwing.board/3rocketsboard',
              name: 'Rockets',
              description: 'Launches, NASA and SpaceX',
              owner: 'did:plc:u',
              moderators: [],
              moderatorHandles: {},
              createdAt: '2026-10-01T00:00:00Z',
            },
            {
              uri: 'at://did:plc:uuuuuuuuuuuuuuuuuuuuuuuu/io.paperwing.board/3kitchenboard',
              name: 'Home Cooking',
              owner: 'did:plc:u',
              moderators: [],
              moderatorHandles: {},
              createdAt: '2026-10-01T00:00:00Z',
            },
          ],
        ],
      ],
    },
  },
  play: async ({ canvas }) => {
    const row = await canvas.findByLabelText('Boards about Space')
    await expect(within(row).getByRole('link', { name: 'Rockets' })).toHaveAttribute('href', '/c/did:plc:uuuuuuuuuuuuuuuuuuuuuuuu/3rocketsboard')
    await expect(within(row).queryByRole('link', { name: 'Home Cooking' })).toBeNull()
  },
}
