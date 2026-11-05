import type { Meta, StoryObj } from '@storybook/react-vite'
import { lazy, Suspense } from 'react'
import { expect, fn, waitFor } from 'storybook/test'
import { LoadBoundary } from './LoadBoundary'

// A part of the app whose code never arrives, the way a dropped connection or a renamed chunk looks.
const Missing = lazy(() => Promise.reject(new Error('Failed to fetch dynamically imported module')))

const meta = {
  title: 'Chrome/LoadBoundary',
  component: LoadBoundary,
  args: { onFail: fn(), children: null },
} satisfies Meta<typeof LoadBoundary>
export default meta
type Story = StoryObj<typeof meta>

/** What loaded shows as usual. */
export const Loaded: Story = {
  args: { children: <p>The editor</p> },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText('The editor')).toBeVisible()
    await expect(args.onFail).not.toHaveBeenCalled()
  },
}

/** What failed to load says so through onFail and leaves the page standing. */
export const FailedToLoad: Story = {
  render: (args) => (
    <div>
      <p>The page</p>
      <LoadBoundary onFail={args.onFail}>
        <Suspense fallback={null}>
          <Missing />
        </Suspense>
      </LoadBoundary>
    </div>
  ),
  play: async ({ canvas, args }) => {
    await waitFor(() => expect(args.onFail).toHaveBeenCalledOnce())
    await expect(canvas.getByText('The page')).toBeVisible()
  },
}
