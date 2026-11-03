import { describe, expect, it } from 'vitest'
import { storyPath } from './storyLink'

describe('the link PaperWing shares for a story', () => {
  it('opens on the article, for a story that links to one', () => {
    expect(storyPath({ key: 'hn-1', url: 'https://example.com/post' })).toBe('/t/for-you/hn-1?tab=article')
  })

  it('opens on the discussion when there’s no article to read: a post of its own, or a video', () => {
    expect(storyPath({ key: 'bs-1', url: null })).toBe('/t/for-you/bs-1')
    expect(storyPath({ key: 'hn-2', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })).toBe('/t/for-you/hn-2')
  })
})
