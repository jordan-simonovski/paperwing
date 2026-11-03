import { beforeAll, describe, expect, it, vi } from 'vitest'
import { spicyOrder, describeSpice } from '../../src/lib/spice'
import type { SpiceGrade, SpiceResponse } from '../../src/lib/spiceTypes'
import { buildState, GRADE_VERSION, gradeFrom, lemmyTree, levelOf, needsGrade, validKey, type SpiceComment } from './spice'

// The background grade runs as soon as it's handed over; tests wait for it by polling.
const background: Promise<unknown>[] = []
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => void background.push(p) }))
const thread = {
  id: 1,
  type: 'story',
  title: 'Big fight',
  author: 'op',
  text: null,
  children: Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, type: 'comment', author: `u${i}`, text: `<p>Point ${i}</p>`, children: [] })),
}
vi.mock('./http.js', async (orig) => ({
  ...(await orig<typeof import('./http.js')>()),
  fetchJson: async (url: string) => {
    if (url.includes('hacker-news.firebaseio.com')) return { kids: [] }
    if (url.includes('hn.algolia.com')) return thread
    throw new Error(`unexpected fetch ${url}`)
  },
}))

const c = (author: string, text: string, children: SpiceComment[] = []): SpiceComment => ({ author, text, children })
const grade = (over: Partial<SpiceGrade>): SpiceGrade => ({ level: 0, heat: 0, confidence: 1, split: 0, pushback: 0, hostile: 0, pileOn: 0, comments: 100, at: 0, ...over })

describe('spice grading', () => {
  it('only grades keys from the fixed sources', () => {
    expect(validKey('hn-123')).toBe(true)
    expect(validKey('lb-abc123')).toBe(true)
    expect(validKey(`bs-${Buffer.from('at://did:plc:abc123/app.bsky.feed.post/3kxyz').toString('base64url')}`)).toBe(true)
    expect(validKey(`bs-${Buffer.from('https://evil.example/').toString('base64url')}`)).toBe(false)
    expect(validKey('lm-123456')).toBe(true)
    expect(validKey('dv-2345678')).toBe(true)
    expect(validKey('md-mastodon.social-1')).toBe(false)
    expect(validKey('hn-1; drop')).toBe(false)
  })

  it('numbers comments in reading order and keeps who replies to whom', () => {
    const { state, total } = buildState('A story', [c('a', 'First', [c('b', 'Reply', [c('c', 'Deeper')])]), c('d', ''), c('e', 'Second')])
    expect(total).toBe(5)
    expect(state.comments.map((x) => [x.id, x.reply_to, x.author])).toEqual([
      [1, null, 'a'],
      [2, 1, 'b'],
      [3, 2, 'c'],
      [4, null, 'e'],
    ])
  })

  it('trims long threads to the top of the discussion', () => {
    const many = Array.from({ length: 200 }, (_, i) => c(`u${i}`, 'x'.repeat(1000)))
    const { state } = buildState('Long', many)
    expect(state.comments.length).toBeLessThan(80)
    expect(state.comments[0].text.length).toBeLessThanOrEqual(451)
  })

  it('reads across the discussion, not down its first argument', () => {
    // A long back-and-forth under the top comment used to fill every slot.
    const chain = (n: number): SpiceComment[] => (n ? [c(`deep${n}`, 'a reply', chain(n - 1))] : [])
    const argument = c(
      'a',
      'First',
      Array.from({ length: 40 }, (_, i) => c(`r${i}`, 'reply', chain(4))),
    )
    const others = Array.from({ length: 30 }, (_, i) => c(`top${i}`, `Top-level ${i}`))
    const { state } = buildState('Busy', [argument, ...others])
    const tops = state.comments.filter((x) => x.reply_to === null)
    expect(tops.length).toBe(16)
    expect(tops.map((x) => x.author).slice(0, 3)).toEqual(['a', 'top0', 'top1'])
    // Each top-level thread still brings some of its replies.
    expect(state.comments.filter((x) => x.reply_to === 1).length).toBeGreaterThan(0)
    expect(state.comments.length).toBeLessThanOrEqual(80)
  })

  it('shares the words as well as the slots, so long comments reach every conversation', () => {
    const long = 'x'.repeat(600)
    const tops = Array.from({ length: 20 }, (_, i) =>
      c(
        `top${i}`,
        long,
        Array.from({ length: 10 }, (_, j) => c(`r${i}-${j}`, long)),
      ),
    )
    const { state } = buildState('Wordy', tops)
    expect(state.comments.filter((x) => x.reply_to === null)).toHaveLength(16)
    // Numbered in reading order: every reply answers a comment that came before it.
    for (const x of state.comments) if (x.reply_to !== null) expect(x.reply_to).toBeLessThan(x.id)
  })

  it('gives a small thread all its slots', () => {
    const { state } = buildState('Small', [
      c(
        'a',
        'One',
        Array.from({ length: 30 }, (_, i) => c(`r${i}`, 'reply')),
      ),
      c('b', 'Two'),
    ])
    expect(state.comments.length).toBe(32)
  })

  it('gives one chilli only for real disagreement, more for heat', () => {
    expect(levelOf({ heat: 1.2, split: 0.7, pushback: 0.6 })).toBe(0)
    expect(levelOf({ heat: 1.5, split: 0.4, pushback: 0.6 })).toBe(0)
    expect(levelOf({ heat: 1.5, split: 0.75, pushback: 0.55 })).toBe(1)
    expect(levelOf({ heat: 1.8, split: 0, pushback: 0 })).toBe(2)
    expect(levelOf({ heat: 2.5, split: 0, pushback: 0 })).toBe(3)
  })

  it('lets smaller sources in with smaller threads', () => {
    expect(needsGrade('lb-abc', 14, undefined)).toBe(true)
    expect(needsGrade('hn-1', 14, undefined)).toBe(false)
    expect(needsGrade('md-x-1', 500, undefined)).toBe(false)
  })

  it('rebuilds Lemmy threads from their paths', () => {
    const v = (id: number, path: string, name = `u${id}`) => ({ comment: { id, content: `c${id}`, path, removed: false, deleted: false }, creator: { name } })
    const tree = lemmyTree([v(1, '0.1'), v(2, '0.1.2'), v(3, '0.3'), v(4, '0.1.2.4'), v(5, '0.9.5')])
    expect(tree.map((c) => c.text)).toEqual(['c1', 'c3'])
    expect(tree[0].children[0].children[0].text).toBe('c4')
  })

  it('regrades only once a thread has grown a lot, and not too often', () => {
    const now = Date.now()
    expect(needsGrade('hn-1', 10, undefined, now)).toBe(false)
    expect(needsGrade('hn-1', 40, undefined, now)).toBe(true)
    expect(needsGrade('hn-1', 55, grade({ comments: 40, at: now - 3600e3, v: GRADE_VERSION }), now)).toBe(false)
    expect(needsGrade('hn-1', 80, grade({ comments: 40, at: now - 3600e3, v: GRADE_VERSION }), now)).toBe(true)
    expect(needsGrade('hn-1', 80, grade({ comments: 40, at: now - 60e3, v: GRADE_VERSION }), now)).toBe(false)
    // Graded by an older set of questions: redone once.
    expect(needsGrade('hn-1', 41, grade({ comments: 40, at: now - 60e3, v: 1 }), now)).toBe(true)
  })

  it('names what makes a discussion heated', () => {
    const g = gradeFrom({ heat: { score: 1.9, confidence: 0.6 }, split: { noul: 0.8 }, pushback: { noul: 0.7 }, hostile: { noul: 0.1 }, pile_on: { noul: 0.2 } }, 120)
    expect(g.level).toBe(2)
    expect(describeSpice(g)).toEqual({ name: 'Heated', reasons: ['split into sides', 'lots of pushback'] })
  })

  it('puts heated discussions first and keeps hot order otherwise', () => {
    const s = (key: string, alsoOn: string[] = []) => ({ key, alsoOn: alsoOn.map((k) => ({ key: k })) })
    const order = spicyOrder([s('a'), s('b'), s('c', ['lb-x']), s('d')], { b: grade({ level: 1, heat: 1.1 }), 'lb-x': grade({ level: 3, heat: 2.6 }) })
    expect(order.map((x) => x.key)).toEqual(['c', 'b', 'a', 'd'])
  })
})

describe('/api/spice', () => {
  let spice: typeof import('../spice')
  const jevBodies: { state: { comments: unknown[] } }[] = []
  beforeAll(async () => {
    process.env.SYNC_MEMORY = '1'
    process.env.TYPESAFE_API_KEY = 'ts-test'
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('https://api.typesafe.ai/')) {
        jevBodies.push(JSON.parse(String(init?.body)))
        return Response.json({ answers: { heat: { score: 2.1, confidence: 0.7 }, split: { noul: 0.9 }, pushback: { noul: 0.8 }, hostile: { noul: 0.2 }, pile_on: { noul: 0.1 } } })
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    spice = await import('../spice')
  })
  const get = async (keys: string) => (await (await spice.GET(new Request(`https://readout.test/api/spice?keys=${keys}`))).json()) as SpiceResponse

  it('grades a big thread in the background, once, and serves the grade after', async () => {
    const first = await get('hn-1~30,hn-2~5,md-x~900')
    expect(first.pending).toEqual(['hn-1'])
    const again = await get('hn-1~30')
    expect(again.pending).toEqual(['hn-1'])
    await Promise.all(background)
    expect(jevBodies).toHaveLength(1)
    expect(jevBodies[0].state.comments).toHaveLength(30)
    const done = await get('hn-1~30')
    expect(done.pending).toEqual([])
    expect(done.grades['hn-1']).toMatchObject({ level: 2, comments: 30 })
  })

  it('rests a source that rate-limited the server', async () => {
    const { kv } = await import('./kv')
    await kv().set('rd:spice-cool:lb', '1', 600)
    const res = await get('lb-abc~40,hn-2~30')
    expect(res.pending).toEqual(['hn-2'])
    await Promise.all(background)
  })
})
