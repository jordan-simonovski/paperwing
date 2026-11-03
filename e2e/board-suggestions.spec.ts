import { MELTING, NOW } from './fixtures/upstream'
import { gotoFeed, row } from './support/app'
import { expect, test } from './support/test'
import type { Story } from '../src/lib/types'

const BOARD = 'at://did:plc:uuuuuuuuuuuuuuuuuuuuuuuu/io.paperwing.board/3kitchenboard'
const SUGGESTION: Story = {
  key: 'bs-sourdough',
  source: 'bluesky',
  sourceLabel: 'PaperWing',
  author: 'cook.example',
  title: 'Sourdough starters compared',
  url: 'https://cooking.example/sourdough',
  discussionUrl: 'https://bsky.app/profile/cook.example/post/3m2sourdoughaa',
  score: 12,
  comments: 4,
  createdAt: NOW - 2 * 3_600_000,
  hasThread: true,
  recommended: true,
  board: { uri: BOARD, name: 'Home Cooking', official: false },
}

test.use({ stubs: { feeds: { boardpicks: [SUGGESTION], 'rss:Quanta': [MELTING] } } })

test('a suggested board post in For you says so, and joining its board is one tap', async ({ page }) => {
  await gotoFeed(page, 'for-you')
  const suggestion = row(page, 'Sourdough starters compared')
  await expect(suggestion.getByText('Suggested')).toBeVisible()
  await suggestion.getByRole('button', { name: 'Join Home Cooking' }).click()
  await expect(page.getByText('Joined Home Cooking: its posts show in For you')).toBeVisible()
  await expect(suggestion.getByRole('button', { name: 'Join Home Cooking' })).toBeHidden()
})
