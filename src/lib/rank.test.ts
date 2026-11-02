import { describe, expect, it } from 'vitest'
import { affinityFactor, canonicalUrl, engagement, merge } from './rank'
import type { Story } from './types'

const filters = { mutedWords: [], mutedDomains: [], hidden: {} }
const s = (key: string, url: string | null, score: number, extra: Partial<Story> = {}): Story => ({ key, source: 'hn', sourceLabel: 'Hacker News', title: key, url, discussionUrl: null, score, comments: 0, createdAt: Date.now() - 3_600_000, hasThread: true, ...extra })

describe('canonicalUrl', () => {
  it('strips tracking params, www and trailing slashes', () => {
    expect(canonicalUrl('https://www.example.com/post/?utm_source=x&id=2')).toBe('example.com/post?id=2')
  })
  it('treats arXiv abs, pdf and versioned links as one paper', () => {
    expect(canonicalUrl('https://arxiv.org/pdf/2410.12345v2')).toBe(canonicalUrl('http://arxiv.org/abs/2410.12345'))
  })
})

describe('merge', () => {
  it('dedupes the same link across sources and keeps the hotter thread as primary', () => {
    const out = merge([[s('hn-1', 'https://a.dev/x', 10), s('hn-2', 'https://b.dev', 500)], [s('lb-1', 'https://www.a.dev/x/', 900, { source: 'lobsters', sourceLabel: 'Lobsters' })]], { sort: 'hot', filters })
    expect(out).toHaveLength(2)
    const a = out.find((r) => r.url?.includes('a.dev'))!
    expect(a.key).toBe('lb-1')
    expect(a.alsoOn.map((x) => x.key)).toEqual(['hn-1'])
  })
  it('applies muted words and hidden keys', () => {
    const out = merge([[s('hn-1', null, 1, { title: 'Crypto pump' }), s('hn-2', null, 1), s('hn-3', null, 1)]], { sort: 'new', filters: { mutedWords: ['crypto'], mutedDomains: [], hidden: { 'hn-3': 1 } } })
    expect(out.map((r) => r.key)).toEqual(['hn-2'])
  })
  it('ranks on engagement, not on being new', () => {
    const h = 3_600_000
    const out = merge(
      [
        [s('hn-1', 'https://a.dev', 300, { comments: 150, createdAt: Date.now() - 8 * h })],
        [s('bs-1', null, 7, { source: 'bluesky', sourceLabel: 'Bluesky', comments: 0, createdAt: Date.now() - h })],
      ],
      { sort: 'hot', filters },
    )
    expect(out.map((r) => r.key)).toEqual(['hn-1', 'bs-1'])
  })
  it('compares sources on a common scale and caps viral posts', () => {
    expect(engagement({ source: 'hn', score: 100, comments: 50 })).toBe(100)
    expect(engagement({ source: 'bluesky', score: 150, comments: 15 })).toBe(100)
    expect(engagement({ source: 'bluesky', score: 3000, comments: 80 })).toBe(800)
    expect(engagement({ source: 'rss', score: undefined })).toBe(40)
  })
  it('counts replies over likes on social networks', () => {
    // A big account's one-liner: hundreds of likes, nobody talking. Worth less than a busy HN thread.
    expect(engagement({ source: 'bluesky', score: 568, comments: 5 })).toBeLessThan(engagement({ source: 'hn', score: 165, comments: 112 }))
  })
  it('makes social commentary earn its place among news, but not among other posts', () => {
    const post = s('bs-1', null, 300, { source: 'bluesky', sourceLabel: 'Bluesky', comments: 10 })
    const link = s('bs-2', 'https://b.dev', 300, { source: 'bluesky', sourceLabel: 'Bluesky', comments: 10 })
    const news = s('hn-1', 'https://a.dev', 120, { comments: 60 })
    expect(merge([[post], [news]], { sort: 'hot', filters }).map((r) => r.key)).toEqual(['hn-1', 'bs-1'])
    expect(merge([[link], [news]], { sort: 'hot', filters })[0].key).toBe('bs-2')
    // On a social channel alone, a text post and a link post are judged alike.
    const social = merge([[post, { ...link, key: 'bs-3', score: 299 }]], { sort: 'hot', filters })
    expect(social[0].key).toBe('bs-1')
  })
  it('lifts posts from people you follow over a stranger saying the same', () => {
    const post = (key: string, followed?: boolean) => s(key, null, 20, { source: 'mastodon', sourceLabel: 'Mastodon', comments: 3, followed })
    const out = merge([[post('md-a'), post('md-b', true)], [s('hn-1', 'https://a.dev', 5)]], { sort: 'hot', filters })
    expect(out.findIndex((r) => r.key === 'md-b')).toBeLessThan(out.findIndex((r) => r.key === 'md-a'))
  })
  it('folds other links about the same event into the strongest row', () => {
    const filler = Array.from({ length: 30 }, (_, i) => s(`hn-f${i}`, `https://f${i}.dev`, 5, { title: `Notes on subject${i} and matter${i}` }))
    const out = merge(
      [
        [s('hn-1', 'https://nyt.com/elvis', 400, { comments: 200, title: 'Owners of Elvis Presley’s Music Sue Anthropic for Copyright Infringement' }), ...filler],
        [s('bs-1', 'https://guardian.com/elvis', 30, { source: 'bluesky', sourceLabel: 'Bluesky', comments: 4, title: 'Anthropic sued for allegedly using 274 Elvis Presley songs to train AI models' })],
      ],
      { sort: 'hot', filters },
    )
    const lead = out.find((r) => r.key === 'hn-1')!
    expect(out.some((r) => r.key === 'bs-1')).toBe(false)
    expect(lead.coverage?.map((c) => c.key)).toEqual(['bs-1'])
  })
  it('sinks stories you keep scrolling past without opening', () => {
    const batch = [s('hn-a', 'https://a.dev', 100, { comments: 50 }), s('hn-b', 'https://b.dev', 90, { comments: 45 })]
    expect(merge([batch], { sort: 'hot', filters }).map((r) => r.key)).toEqual(['hn-a', 'hn-b'])
    expect(merge([batch], { sort: 'hot', filters, seen: { 'hn-a': 4 } }).map((r) => r.key)).toEqual(['hn-b', 'hn-a'])
    // One earlier look is free.
    expect(merge([batch], { sort: 'hot', filters, seen: { 'hn-a': 1 } })[0].key).toBe('hn-a')
  })
  it('weighs taste by topic and site, within bounds', () => {
    const story = (key: string, url: string | null) => ({ ...s(key, url, 10), topics: ['ai'] })
    const liked = affinityFactor(story('hn-x', 'https://www.theregister.com/x'), { 't:ai': 2 })
    expect(liked).toBeGreaterThan(1)
    // A site you've turned down pulls the same topic back.
    expect(affinityFactor(story('hn-y', 'https://www.theregister.com/y'), { 't:ai': 2, 'd:theregister.com': -3 })).toBeLessThan(liked)
    expect(affinityFactor(story('hn-z', null), { 't:ai': -3 })).toBeGreaterThanOrEqual(0.35)
    expect(affinityFactor(story('hn-w', null), {})).toBe(1)
  })
})
