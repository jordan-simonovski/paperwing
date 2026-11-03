import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePrefs } from '../lib/store'
import { useUI } from '../lib/ui'
import { story } from '../test/fixtures'
import { hideStory } from './StoryRow'

vi.mock('../lib/html', () => ({ plainText: vi.fn(), sanitize: vi.fn() }))

const said = () => useUI.getState().toasts.map((t) => t.message)

describe('hiding a story', () => {
  beforeEach(() => {
    usePrefs.setState({ firsts: [] })
    useUI.setState({ toasts: [] })
  })

  it('says the first time what hiding teaches the ranking, then just that it’s hidden', () => {
    hideStory('hn-1', story({ key: 'hn-1' }))
    hideStory('hn-2', story({ key: 'hn-2' }))
    expect(said()).toEqual([expect.stringMatching(/^Story hidden\. PaperWing now ranks stories like it a little lower/), 'Story hidden'])
  })

  it('keeps the explanation for a hide that teaches something', () => {
    // Without the story there's nothing to learn from, so the first isn't spent.
    hideStory('hn-3')
    expect(said()).toEqual(['Story hidden'])
    expect(usePrefs.getState().firsts).toEqual([])
  })
})
