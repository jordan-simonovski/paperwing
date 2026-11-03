import { describe, expect, it } from 'vitest'
import { coverageQuery, sameEvent } from './coverage'
import { BSKY_MODERATION, judge, labelerFrom, moderateComments, moderateStory, withSetting } from './moderation'
import type { Story } from './types'

const story = (over: Partial<Story> = {}): Story => ({
  key: 'bs-x',
  source: 'bluesky',
  sourceLabel: 'Bluesky',
  title: 'A post',
  url: null,
  discussionUrl: null,
  createdAt: 0,
  hasThread: true,
  ...over,
})
const indie = labelerFrom({
  creator: { did: 'did:plc:indie', handle: 'indie.example', displayName: 'Indie labels' },
  policies: {
    labelValues: ['ragebait', 'spoiler'],
    labelValueDefinitions: [
      { identifier: 'ragebait', defaultSetting: 'hide', blurs: 'content', locales: [{ lang: 'en', name: 'Rage bait' }] },
      { identifier: 'spoiler', defaultSetting: 'warn', blurs: 'content', locales: [{ lang: 'en', name: 'Spoiler' }] },
    ],
  },
})

describe('labels', () => {
  it('follow Bluesky’s own moderation by default', () => {
    expect(judge([{ src: BSKY_MODERATION, val: 'spam' }], undefined, [])).toMatchObject({ hide: true })
    expect(judge([{ src: BSKY_MODERATION, val: 'graphic-media' }], undefined, [])).toEqual({ warning: 'Graphic media', mediaOnly: true })
  })
  it('count an author’s labels on their own posts only', () => {
    expect(judge([{ src: 'did:plc:me', val: 'nudity' }], 'did:plc:me', []).warning).toBe('Nudity')
    expect(judge([{ src: 'did:plc:someone', val: 'nudity' }], 'did:plc:me', [])).toEqual({})
  })
  it('apply a subscribed labeler’s own values, as you set them', () => {
    expect(judge([{ src: 'did:plc:indie', val: 'ragebait' }], undefined, [])).toEqual({})
    expect(judge([{ src: 'did:plc:indie', val: 'ragebait' }], undefined, [indie])).toMatchObject({ hide: true })
    expect(judge([{ src: 'did:plc:indie', val: 'ragebait' }], undefined, [withSetting(indie, 'ragebait', 'ignore')])).toEqual({})
    expect(judge([{ src: 'did:plc:indie', val: 'spoiler' }], undefined, [indie])).toEqual({ warning: 'Spoiler', mediaOnly: false })
  })
  it('turn into hidden or covered stories by mode', () => {
    const warned = story({ labels: [{ src: BSKY_MODERATION, val: 'graphic-media' }] })
    expect(moderateStory(warned, [], 'blur')?.warning).toBe('Graphic media')
    expect(moderateStory(warned, [], 'hide')).toBeUndefined()
    expect(moderateStory(story({ warning: 'US politics' }), [], 'blur')?.warning).toBe('US politics')
    expect(moderateStory(story({ labels: [{ src: BSKY_MODERATION, val: '!hide' }] }), [], 'show')).toBeUndefined()
  })
  it('fold comments with muted words or labels, keeping their replies', () => {
    const [c] = moderateComments(
      [{ id: '1', author: 'a', html: '<p>The Election is rigged</p>', createdAt: 0, children: [{ id: '2', author: 'b', html: '<p>No it isn’t</p>', createdAt: 0, children: [] }] }],
      ['election'],
      [],
    )
    expect(c.folded).toBe('Contains a word you muted')
    expect(c.children[0].folded).toBeUndefined()
  })
  it('folds likely spoilers, after anything you chose to fold', () => {
    const tree = [
      { id: '1', author: 'a', html: '<p>The election episode</p>', createdAt: 0, children: [{ id: '2', author: 'b', html: '<p>He dies at the end</p>', createdAt: 0, children: [] }] },
      { id: '3', author: 'c', html: '<p>Great show</p>', createdAt: 0, children: [] },
    ]
    const [first, second] = moderateComments(tree, ['election'], [], new Set(['1', '2']))
    expect(first.folded).toBe('Contains a word you muted')
    expect(first.children[0].folded).toBe('Possible spoiler')
    expect(second.folded).toBeUndefined()
  })
})

describe('coverage', () => {
  it('searches by the names in a headline', () => {
    expect(coverageQuery('Albanese and Sunak sign AUKUS submarine deal in Canberra')).toMatch(/albanese/)
    expect(coverageQuery('Hi')).toBeUndefined()
  })
  it('keeps headlines about the same event, one per publisher', () => {
    const mine = { title: 'NASA delays Artemis III moon landing to 2028', url: 'https://a.example/x', createdAt: Date.parse('2026-10-30') }
    const found = [
      story({ key: 'ln-1', title: 'Artemis III moon landing slips to 2028, NASA says', url: 'https://b.example/1', site: 'b.example', createdAt: Date.parse('2026-10-30') }),
      story({ key: 'ln-2', title: 'NASA pushes Artemis III to 2028', url: 'https://b.example/2', site: 'b.example', createdAt: Date.parse('2026-10-30') }),
      story({ key: 'ln-3', title: 'Best moon photos of the year', url: 'https://c.example/3', site: 'c.example', createdAt: Date.parse('2026-10-30') }),
      story({ key: 'ln-4', title: 'NASA delays Artemis III moon landing to 2028', url: 'https://d.example/4', site: 'd.example', createdAt: Date.parse('2026-01-01') }),
    ]
    expect(sameEvent(mine, found).map((s) => s.key)).toEqual(['ln-1'])
  })
})
