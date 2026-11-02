import { describe, expect, it } from 'vitest'
import { resolveChannel, SOURCE_CHANNELS, sourceChannels } from './channels'

const base = { followed: [] as string[], interests: [], customFeeds: [] }

describe('source channels', () => {
  it('shows tech’s own sources to people who follow tech, and Blogs as Publishers to everyone else', () => {
    const tech = sourceChannels(['observability']).map((c) => c.label)
    expect(tech).toContain('Hacker News')
    expect(tech).toContain('Blogs')
    const general = sourceChannels(['football', 'science']).map((c) => c.label)
    expect(general).not.toContain('Hacker News')
    expect(general).not.toContain('ML papers')
    expect(general).toContain('Publishers')
    expect(general).toContain('Bluesky')
  })

  it('all lead somewhere', () => {
    for (const c of SOURCE_CHANNELS) expect(resolveChannel(c.id, undefined, base), c.id).toBeDefined()
  })
})
