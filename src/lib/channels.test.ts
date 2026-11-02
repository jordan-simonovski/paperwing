import { describe, expect, it } from 'vitest'
import { resolveChannel } from './channels'

const base = { followed: [], interests: [], customFeeds: [] }

describe('Bluesky Following', () => {
  it('asks to sign in when signed out', () => {
    const c = resolveChannel('bluesky', 'following', base)!
    expect(c.feeds).toEqual([])
    expect(c.empty?.title).toMatch(/Sign in/)
  })
  it('asks for the timeline permission when an older sign-in lacks it', () => {
    const c = resolveChannel('bluesky', 'following', { ...base, bluesky: true, blueskyTimeline: false })!
    expect(c.feeds).toEqual([])
    expect(c.empty?.title).toBe('One more permission')
  })
  it('tries the timeline while the granted permissions are still unknown, or granted', () => {
    for (const blueskyTimeline of [undefined, true]) {
      const c = resolveChannel('bluesky', 'following', { ...base, bluesky: true, blueskyTimeline })!
      expect(c.feeds).toEqual([{ kind: 'bluesky', feed: 'following' }])
      expect(c.empty).toBeUndefined()
    }
  })
})
