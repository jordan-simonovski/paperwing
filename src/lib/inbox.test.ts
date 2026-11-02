import { afterEach, describe, expect, it, vi } from 'vitest'
import { groupNotices, hnActivity, type Notice } from './inbox'

const n = (over: Partial<Notice>): Notice => ({ id: Math.random().toString(), network: 'bluesky', kind: 'like', actors: ['a'], at: Date.now(), ...over })

describe('grouping', () => {
  it('folds likes on one post into one line, keeps replies apart', () => {
    const now = Date.now()
    const out = groupNotices([
      n({ actors: ['alice'], open: 'bs-1', at: now }),
      n({ actors: ['bob'], open: 'bs-1', at: now - 1000 }),
      n({ actors: ['carol'], open: 'bs-2', at: now - 2000 }),
      n({ kind: 'reply', actors: ['dan'], open: 'bs-1', at: now - 500, text: 'Agreed' }),
      n({ kind: 'reply', actors: ['erin'], open: 'bs-1', at: now - 600, text: 'Nope' }),
    ])
    expect(out.map((x) => `${x.kind}:${x.actors.join('+')}`)).toEqual(['like:alice+bob', 'reply:dan', 'reply:erin', 'like:carol'])
  })
  it('doesn’t fold likes days apart', () => {
    const now = Date.now()
    expect(groupNotices([n({ open: 'x', at: now }), n({ open: 'x', at: now - 3 * 86_400_000 })])).toHaveLength(2)
  })
})

describe('Hacker News activity', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('lists what you wrote and finds replies under it, not your own', async () => {
    const now = Math.floor(Date.now() / 1000)
    const responses: Record<string, unknown> = {
      algolia: {
        hits: [
          { objectID: '100', _tags: ['comment', 'author_me'], comment_text: '<p>I think so</p>', story_title: 'A story', story_id: 1, created_at_i: now - 3600 },
          { objectID: '200', _tags: ['story', 'author_me'], title: 'Show HN: mine', points: 12, num_comments: 3, created_at_i: now - 7200 },
        ],
      },
      '100': { id: 100, time: now - 3600, kids: [101, 102] },
      '200': { id: 200, time: now - 7200, kids: [201] },
      '101': { id: 101, by: 'pg', text: 'Why?', time: now - 60 },
      '102': { id: 102, by: 'me', text: 'Talking to myself', time: now - 30 },
      '201': { id: 201, by: 'dang', text: 'Nice', time: now - 90, dead: true },
    }
    vi.stubGlobal('fetch', async (url: string) => {
      const key = url.includes('algolia') ? 'algolia' : /item\/(\d+)\.json/.exec(url)![1]
      return new Response(JSON.stringify(responses[key] ?? null), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const a = await hnActivity('me')
    expect(a.mine.map((m) => `${m.kind}:${m.open}`)).toEqual(['comment:hn-1', 'post:hn-200'])
    expect(a.notices).toHaveLength(1)
    expect(a.notices[0]).toMatchObject({ kind: 'reply', actors: ['pg'], text: 'Why?', subject: 'I think so', open: 'hn-1' })
  })
})
