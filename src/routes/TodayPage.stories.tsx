import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent } from 'storybook/test'
import { FeedFetcherContext, type FeedFetcher } from '../lib/hooks'
import { story } from '../test/fixtures'
import { TodayPage } from './TodayPage'

const HOUR = 3_600_000
// Edition stories are picked from the last day, by the real clock, so they're dated from it.
const todays = () => [
  story({ key: 'hn-41001', title: 'NASA’s Artemis II crew', url: 'https://www.nasa.gov/mission/artemis-ii/', createdAt: Date.now() - HOUR }),
  story({ key: 'hn-41002', title: 'The Web We Lost', createdAt: Date.now() - 2 * HOUR }),
]

/** Every feed fails the first time it's asked and answers after that, like a connection coming back. */
function Recovering() {
  const [fetcher] = useState(() => {
    const asked = new Set<string>()
    const recovering: FeedFetcher = async (ref) => {
      const id = JSON.stringify(ref)
      if (!asked.has(id)) {
        asked.add(id)
        throw new Error('No answer')
      }
      return todays()
    }
    return recovering
  })
  return (
    <FeedFetcherContext.Provider value={fetcher}>
      <TodayPage />
    </FeedFetcherContext.Provider>
  )
}

const meta = {
  title: 'Pages/Today',
  component: TodayPage,
  parameters: { app: { prefs: { followed: ['space'] }, route: { path: '/today/:itemKey?', url: '/today' } } },
} satisfies Meta<typeof TodayPage>
export default meta
type Story = StoryObj<typeof meta>

/** None of For you's sources answered: say so, with a way to try again, and build the edition once they do. */
export const SourcesComeBack: Story = {
  render: () => <Recovering />,
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Try again' }))
    await expect(await canvas.findByText("That's the edition")).toBeVisible()
    await expect(canvas.getByText('NASA’s Artemis II crew')).toBeVisible()
  },
}
