import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import type { Hiring } from '../lib/hiringTypes'
import { NOW } from '../test/fixtures'
import { StillHiring } from './StillHiring'

const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 10)

const dropbox: Hiring = {
  employer: 'Dropbox',
  board: 'https://job-boards.greenhouse.io/dropbox',
  open: 31,
  fresh: 10,
  functions: [
    ['Engineering', 10],
    ['Marketing', 6],
    ['Sales', 5],
    ['People, finance and legal', 4],
    ['Design', 3],
    ['Other', 3],
  ],
  latest: [
    { title: 'Senior Backend Engineer, Core Storage', url: 'https://job-boards.greenhouse.io/dropbox/jobs/1', location: 'Remote - US', function: 'Engineering', postedAt: day(0) },
    { title: 'Product Marketing Manager, Dash', url: 'https://job-boards.greenhouse.io/dropbox/jobs/2', location: 'San Francisco, CA', function: 'Marketing', postedAt: day(1) },
    { title: 'Enterprise Account Executive', url: 'https://job-boards.greenhouse.io/dropbox/jobs/3', location: 'Dublin, Ireland', function: 'Sales', postedAt: day(6) },
  ],
}

// A Workday board: a count and job families, but posting dates it re-stamps in bulk, so no "new" count.
const nvidia: Hiring = {
  employer: 'Nvidia',
  board: 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite',
  open: 2757,
  fresh: null,
  functions: [
    ['Engineering', 1740],
    ['Sales', 327],
    ['Other', 300],
    ['Product', 110],
    ['Operations', 110],
  ],
  latest: [
    {
      title: 'Senior Software Engineer, Object Storage - DGX Cloud',
      url: 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/1',
      location: 'Santa Clara, CA',
      function: 'Engineering',
      postedAt: day(0),
    },
  ],
}

const meta = {
  title: 'Reading/StillHiring',
  component: StillHiring,
  args: { employer: 'Dropbox', now: NOW },
  parameters: { app: { queries: [[['hiring', 'Dropbox'], dropbox]] } },
  decorators: [(Story) => <div style={{ maxWidth: 640 }}>{Story()}</div>],
} satisfies Meta<typeof StillHiring>
export default meta
type Story = StoryObj<typeof meta>

export const Hiring_: Story = {
  name: 'Hiring',
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'Still hiring' })).toBeVisible()
    await expect(canvas.getByText('posted in the last two weeks', { exact: false })).toBeVisible()
    await expect(canvas.getByRole('link', { name: /Senior Backend Engineer/ })).toHaveAttribute('href', 'https://job-boards.greenhouse.io/dropbox/jobs/1')
    await expect(canvas.getByRole('link', { name: /See every opening/ })).toHaveAttribute('href', dropbox.board)
  },
}

/** A big board that re-posts in bulk: its total and families, without claiming what's new. */
export const BigBoard: Story = {
  args: { employer: 'Nvidia' },
  parameters: { app: { queries: [[['hiring', 'Nvidia'], nvidia]] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('2,757')).toBeVisible()
    await expect(canvas.queryByText('posted in the last two weeks', { exact: false })).toBeNull()
  },
}

export const NoOpenings: Story = {
  parameters: { app: { queries: [[['hiring', 'Dropbox'], { ...dropbox, open: 0, fresh: 0, functions: [], latest: [] }]] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/lists no open roles right now/)).toBeVisible()
  },
}

/** The board couldn't be read: the panel stays out of the way. */
export const BoardDown: Story = {
  parameters: { app: { queries: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('heading', { name: /Still hiring/ })).toBeNull()
  },
}
