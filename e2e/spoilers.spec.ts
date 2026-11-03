import type { SpiceGrade } from '../src/lib/spiceTypes'
import { TELESCOPE, WEB_WE_LOST } from './fixtures/upstream'
import { gotoFeed, pane, row } from './support/app'
import { expect, test } from './support/test'

// A busy thread its grade calls fiction, with one reply that gives the plot away.
const KEY = 'hn-41000001'
const grade: SpiceGrade = {
  level: 0,
  heat: 0.4,
  confidence: 0.8,
  sharp: 0.1,
  flame: 0,
  split: 0.1,
  pushback: 0.2,
  hostile: 0,
  insights: { sad: 0, delighted: 0.2, warm: 0.3, political: 0, fiction: 0.95, disputed: [], answers: [] },
  comments: 30,
  at: Date.now(),
  v: 6,
}
test.use({ stubs: { hnTop: [{ ...WEB_WE_LOST, num_comments: 30 }, TELESCOPE], spice: { grades: { [KEY]: grade }, spoilers: { [KEY]: ['41000102'] } } } })

const spoiler = 'The tools let you see what people you trusted were reading.'

test('a comment that may spoil the plot stays folded until you choose to see it', async ({ page }) => {
  await gotoFeed(page)
  await row(page, 'The Web We Lost').getByRole('button', { name: '30 comments' }).click()
  const story = pane(page)
  await expect(story.getByText('RSS readers were the social network for a lot of us.')).toBeVisible()
  await expect(story.getByText('Possible spoiler')).toBeVisible()
  await expect(story.getByText(spoiler)).toBeHidden()

  await story.getByRole('button', { name: 'Show' }).click()
  await expect(story.getByText(spoiler)).toBeVisible()
})

test.describe('with spoiler folding turned off', () => {
  test.use({ prefs: { hideSpoilers: false } })
  test('every comment shows', async ({ page }) => {
    await gotoFeed(page)
    await row(page, 'The Web We Lost').getByRole('button', { name: '30 comments' }).click()
    await expect(pane(page).getByText(spoiler)).toBeVisible()
    await expect(pane(page).getByText('Possible spoiler')).toBeHidden()
  })
})
