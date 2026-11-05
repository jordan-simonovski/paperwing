import type { Meta, StoryObj } from '@storybook/react-vite'
import { Component, Suspense, useState, type ReactNode } from 'react'
import { expect, fn, waitFor } from 'storybook/test'
import { retryableLazy } from '../lib/retryableLazy'
import { LoadBoundary } from './LoadBoundary'

// A part of the app whose code doesn't arrive the first time (a dropped connection), then does.
const flaky = () => {
  let tries = 0
  return retryableLazy(async () => {
    if (tries++ === 0) throw new Error('Failed to fetch dynamically imported module')
    return () => <p>The editor</p>
  })
}

/** Stands in for the app's error screen. */
class ErrorScreen extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p>Error screen</p> : this.props.children
  }
}

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

function Opener({ onFail }: { onFail: () => void }) {
  const [part] = useState(flaky)
  const [attempt, setAttempt] = useState(0)
  const Part = part.Component
  return (
    <div>
      <p>The page</p>
      <LoadBoundary
        key={attempt}
        onFail={() => {
          onFail()
          part.retry()
        }}
      >
        <Suspense fallback={null}>
          <Part />
        </Suspense>
      </LoadBoundary>
      <button type="button" onClick={() => setAttempt((a) => a + 1)}>
        Open again
      </button>
    </div>
  )
}

/** Code that fails to load says so through onFail, leaves the page standing, and loads on the next try. */
export const FailedThenRetried: Story = {
  render: (args) => <Opener onFail={args.onFail} />,
  play: async ({ canvas, args, userEvent }) => {
    await waitFor(() => expect(args.onFail).toHaveBeenCalledOnce())
    await expect(canvas.getByText('The page')).toBeVisible()
    await expect(canvas.queryByText('The editor')).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Open again' }))
    await expect(await canvas.findByText('The editor')).toBeVisible()
    await expect(args.onFail).toHaveBeenCalledOnce()
  },
}

function Broken(): ReactNode {
  throw new Error('a bug while rendering')
}

/** A bug inside isn't a failed load: it goes on to the error screen, and onFail stays quiet. */
export const BugGoesToTheErrorScreen: Story = {
  render: (args) => (
    <ErrorScreen>
      <LoadBoundary onFail={args.onFail}>
        <Broken />
      </LoadBoundary>
    </ErrorScreen>
  ),
  play: async ({ canvas, args }) => {
    await expect(await canvas.findByText('Error screen')).toBeVisible()
    await expect(args.onFail).not.toHaveBeenCalled()
  },
}
