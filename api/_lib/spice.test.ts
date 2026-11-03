import { beforeAll, describe, expect, it, vi } from 'vitest'
import { spicyOrder, describeSpice } from '../../src/lib/spice'
import type { SpiceGrade, SpiceResponse, SpoilerResponse } from '../../src/lib/spiceTypes'
import {
  buildState,
  GRADE_VERSION,
  gradeFrom,
  lemmyTree,
  levelOf,
  needsGrade,
  needsSpoilerCheck,
  replyQuestions,
  spoilerComments,
  topQuestions,
  validKey,
  type JevAnswers,
  type SpiceComment,
} from './spice'

// The background grade runs as soon as it's handed over; tests wait for it by polling.
const background: Promise<unknown>[] = []
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => void background.push(p) }))
const thread = {
  id: 1,
  type: 'story',
  title: 'Big fight',
  author: 'op',
  text: null,
  // Ten top-level comments with two replies each: thirty in all.
  children: Array.from({ length: 10 }, (_, i) => ({
    id: 100 + i,
    type: 'comment',
    author: `u${i}`,
    text: `<p>Point ${i}</p>`,
    children: [1, 2].map((j) => ({ id: 1000 + i * 10 + j, type: 'comment', author: `r${i}${j}`, text: `<p>Reply ${j}</p>`, children: [] })),
  })),
}
vi.mock('./http.js', async (orig) => ({
  ...(await orig<typeof import('./http.js')>()),
  fetchJson: async (url: string) => {
    if (url.includes('hacker-news.firebaseio.com')) return { kids: [] }
    if (url.includes('hn.algolia.com')) return thread
    throw new Error(`unexpected fetch ${url}`)
  },
}))

// Thread-wide answers for a sad, warm thread; tests add the per-comment ones.
const answers: Omit<JevAnswers, 'items'> = {
  tone: { score: 1.9, confidence: 0.6, probabilities: { '0': 0, '1': 0.3, '2': 0.6, '3': 0.1 } },
  split: { noul: 0.8 },
  sad: { noul: 0.9 },
  delighted: { noul: 0.1 },
  warm: { noul: 0.75 },
  political: { noul: 0.05 },
  fiction: { noul: 0.02 },
}
let made = 0
const c = (author: string, text: string, children: SpiceComment[] = []): SpiceComment => ({ id: `c${++made}`, author, text, children })
const grade = (over: Partial<SpiceGrade>): SpiceGrade => ({ level: 0, heat: 0, confidence: 1, split: 0, pushback: 0, hostile: 0, sharp: 0, flame: 0, comments: 100, at: 0, ...over })

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
    const calm = { sharp: 0.1, flame: 0, split: 0.2, pushback: 0.25, hostile: 0 }
    expect(levelOf(calm)).toBe(0)
    // Sharp replies with little pushback, or sides with little pushback, are still calm.
    expect(levelOf({ ...calm, sharp: 0.7, pushback: 0.3 })).toBe(0)
    expect(levelOf({ ...calm, split: 0.9, pushback: 0.4 })).toBe(0)
    expect(levelOf({ ...calm, split: 0.8, pushback: 0.55 })).toBe(1)
    expect(levelOf({ ...calm, sharp: 0.5, pushback: 0.42 })).toBe(1)
    expect(levelOf({ ...calm, sharp: 0.65, pushback: 0.5 })).toBe(2)
    expect(levelOf({ ...calm, sharp: 0.9, flame: 0.45, pushback: 0.5 })).toBe(3)
    // Hostile people name a reason; on their own they don't make a flamewar.
    const sniped = { ...calm, hostile: 4 }
    expect(levelOf({ ...sniped, sharp: 0.7, flame: 0.12, pushback: 0.5 })).toBe(2)
  })

  it('asks about each reply with the comment it answers', () => {
    const { state } = buildState('A story', [c('a', 'Rust is great', [c('b', 'It is not'), c('c', 'Agreed')]), c('d', 'Unrelated')])
    const q = replyQuestions(state) as Record<string, { instructions: { comment: { author: string }; reply: { text: string } } }>
    expect(Object.keys(q).sort()).toEqual(['hostile_2', 'hostile_3', 'push_2', 'push_3'])
    expect(q.push_2.instructions.comment.author).toBe('a')
    expect(q.push_2.instructions.reply.text).toBe('It is not')
  })

  it('lets smaller sources in with smaller threads', () => {
    expect(needsGrade('lb-abc', 14, undefined)).toBe(true)
    expect(needsGrade('hn-1', 14, undefined)).toBe(false)
    expect(needsGrade('md-x-1', 500, undefined)).toBe(false)
  })

  it('rebuilds Lemmy threads from their paths', () => {
    const v = (id: number, path: string, name = `u${id}`, host = 'lemmy.world') => ({
      comment: { id, content: `c${id}`, path, removed: false, deleted: false },
      creator: { name, actor_id: `https://${host}/u/${name}` },
    })
    const tree = lemmyTree([v(1, '0.1'), v(2, '0.1.2'), v(3, '0.3', 'sam', 'beehaw.org'), v(4, '0.1.2.4'), v(5, '0.9.5')], 'lemmy.world')
    expect(tree.map((c) => c.text)).toEqual(['c1', 'c3'])
    // Ids and names as the reader shows them: someone from another instance keeps it.
    expect(tree.map((c) => [c.id, c.author])).toEqual([
      ['1', 'u1'],
      ['3', 'sam@beehaw.org'],
    ])
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

  it('counts pushback as a share of replies and hostility by people', () => {
    const built = buildState('A story', [c('a', 'One', [c('x', 'No'), c('x', 'Still no'), c('y', 'Yes')])])
    const items = { push_2: { noul: 0.9 }, push_3: { noul: 0.8 }, push_4: { noul: 0.1 }, hostile_2: { noul: 0.9 }, hostile_3: { noul: 0.8 }, hostile_4: { noul: 0.2 }, asks_help: { noul: 0 } }
    const g = gradeFrom(built, { ...answers, items }, 120)
    expect(g).toMatchObject({ sharp: 0.7, flame: 0.1, pushback: 0.6, hostile: 1, level: 2 })
    expect(describeSpice(g)).toEqual({ name: 'Heated', reasons: ['split into sides', 'lots of pushback'] })
    // A flamewar by its tone alone still says why.
    expect(describeSpice(grade({ level: 3, flame: 0.5 })).reasons).toEqual(['some personal attacks'])
  })

  it('names the comments to jump to, one per person', () => {
    const built = buildState('A story', [c('a', 'Wrong'), c('a', 'Still wrong'), c('b', 'Also wrong'), c('d', 'Fine')], 'Which editor should I use?')
    expect(built.state.story).toEqual({ title: 'A story', text: 'Which editor should I use?' })
    const [, a2, b, d] = built.sources
    const items = {
      asks_help: { noul: 0.9 },
      disputes_1: { noul: 0.8 },
      disputes_2: { noul: 0.95 },
      disputes_3: { noul: 0.75 },
      disputes_4: { noul: 0.1 },
      answers_4: { noul: 0.9 },
      answers_1: { noul: 0.2 },
    }
    const g = gradeFrom(built, { ...answers, items }, 120)
    expect(g.insights).toMatchObject({ sad: 0.9, warm: 0.75 })
    expect(g.insights?.disputed).toEqual([
      { id: a2, author: 'a' },
      { id: b, author: 'b' },
    ])
    expect(g.insights?.answers).toEqual([{ id: d, author: 'd' }])
    // One person disputing it is an opinion; a post that asks nothing has no answers.
    const lone = gradeFrom(built, { ...answers, items: { ...items, disputes_3: { noul: 0.1 }, asks_help: { noul: 0.2 } } }, 120)
    expect(lone.insights).toMatchObject({ disputed: [], answers: [] })
  })

  it('asks about each top-level comment and what the post asks', () => {
    const { state } = buildState('A story', [c('a', 'One', [c('b', 'Reply')]), c('d', 'Two')])
    expect(Object.keys(topQuestions(state)).sort()).toEqual(['answers_1', 'answers_3', 'asks_help', 'disputes_1', 'disputes_3'])
  })

  it('checks every comment for spoilers, to a limit, and again once the thread grows', () => {
    const tree = [
      c(
        'a',
        'y'.repeat(2000),
        Array.from({ length: 450 }, (_, i) => c(`r${i}`, 'reply')),
      ),
      c('gone', ''),
    ]
    const all = spoilerComments(tree)
    expect(all).toHaveLength(400)
    expect(all[0].text.length).toBe(1501)
    const now = Date.now()
    const held = { ids: [], comments: 100, at: now - 3600e3 }
    expect(needsSpoilerCheck(undefined, 10, now)).toBe(true)
    expect(needsSpoilerCheck(held, 115, now)).toBe(false)
    expect(needsSpoilerCheck(held, 120, now)).toBe(true)
    expect(needsSpoilerCheck({ ...held, at: now - 60e3 }, 500, now)).toBe(false)
    // A source that sends the server fewer comments than the reader counts (Lemmy stops at 300)
    // is measured against what the reader counted when it was checked, not checked forever.
    const capped = { ids: [], comments: 300, asked: 520, at: now - 3600e3 }
    expect(needsSpoilerCheck(capped, 530, now)).toBe(false)
    expect(needsSpoilerCheck(capped, 640, now)).toBe(true)
  })

  it('puts heated discussions first and keeps hot order otherwise', () => {
    const s = (key: string, alsoOn: string[] = []) => ({ key, alsoOn: alsoOn.map((k) => ({ key: k })) })
    const order = spicyOrder([s('a'), s('b'), s('c', ['lb-x']), s('d')], { b: grade({ level: 1, heat: 1.1 }), 'lb-x': grade({ level: 3, heat: 2.6 }) })
    expect(order.map((x) => x.key)).toEqual(['c', 'b', 'a', 'd'])
  })
})

describe('/api/spice', () => {
  let spice: typeof import('../spice')
  type JevBody = { state: { comments?: unknown[] }; questions: Record<string, unknown> }
  const jevBodies: JevBody[] = []
  let dropOne = false
  let dropTop = false
  beforeAll(async () => {
    process.env.SYNC_MEMORY = '1'
    process.env.TYPESAFE_API_KEY = 'ts-test'
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('https://api.typesafe.ai/')) {
        const body = JSON.parse(String(init?.body)) as JevBody
        jevBodies.push(body)
        if (body.questions.tone)
          return Response.json({
            answers: {
              tone: { score: 2, confidence: 0.7, probabilities: { '0': 0, '1': 0.2, '2': 0.7, '3': 0.1 } },
              split: { noul: 0.9 },
              sad: { noul: 0.1 },
              delighted: { noul: 0.1 },
              warm: { noul: 0.2 },
              political: { noul: 0.9 },
              // About fiction, so its comments can be checked for spoilers.
              fiction: { noul: 0.9 },
            },
          })
        // Per reply: pushing back, not hostile; one answer missing when a test asks for it.
        // The second comment in reading order gives the plot away.
        const answers = Object.fromEntries(Object.keys(body.questions).map((q) => [q, { noul: q.startsWith('push_') || q === 'spoiler_1' ? 0.8 : 0.1 }]))
        if (dropOne || (dropTop && body.questions.asks_help)) delete answers[Object.keys(answers)[0]]
        return Response.json({ answers })
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
    // One request for the thread, one for its replies, one for its top-level comments.
    expect(jevBodies).toHaveLength(3)
    expect(jevBodies.find((b) => b.questions.tone)?.state.comments).toHaveLength(30)
    expect(Object.keys(jevBodies.find((b) => b.questions.push_2)!.questions)).toHaveLength(40)
    // Ten top-level comments, two questions each, and whether the post asks anything.
    expect(Object.keys(jevBodies.find((b) => b.questions.asks_help)!.questions)).toHaveLength(21)
    const done = await get('hn-1~30')
    expect(done.pending).toEqual([])
    expect(done.grades['hn-1']).toMatchObject({ level: 2, comments: 30, insights: { political: 0.9, disputed: [], answers: [] } })
  })

  it('keeps the chillies when only the per-comment questions fail', async () => {
    dropTop = true
    await get('hn-5~30')
    await Promise.allSettled(background)
    dropTop = false
    const { kv } = await import('./kv')
    const g = JSON.parse((await kv().get('rd:spice:hn-5'))!) as SpiceGrade
    expect(g).toMatchObject({ level: 2, insights: { political: 0.9, disputed: [], answers: [] } })
  })

  it('stores nothing when Jev leaves out an answer', async () => {
    dropOne = true
    await get('hn-3~30')
    await Promise.allSettled(background)
    dropOne = false
    const { kv } = await import('./kv')
    expect(await kv().get('rd:spice:hn-3')).toBeNull()
    expect(JSON.parse((await kv().get('rd:spice-error'))!)).toMatchObject({ key: 'hn-3', message: 'Jev left out an answer' })
  })

  it('works the level out again for current grades, and leaves older ones as they were', async () => {
    const { kv } = await import('./kv')
    // Asked older questions: no sharp or flame to work from, so its stored level stands.
    await kv().set('rd:spice:hn-7', JSON.stringify(grade({ level: 2, heat: 1.9, v: GRADE_VERSION - 1 })), 600)
    // Current questions, stored before the thresholds moved: the level comes from today's.
    await kv().set('rd:spice:hn-8', JSON.stringify(grade({ level: 0, sharp: 0.7, pushback: 0.5, v: GRADE_VERSION })), 600)
    const res = await get('hn-7~5,hn-8~5')
    expect(res.grades['hn-7'].level).toBe(2)
    expect(res.grades['hn-8'].level).toBe(2)
  })

  it('checks every comment of a thread about fiction for spoilers, and only such a thread', async () => {
    const spoilers = async (key: string) => (await (await spice.GET(new Request(`https://readout.test/api/spice?spoilers=${key}`))).json()) as SpoilerResponse
    // hn-1 was graded above, as about fiction.
    const asked = jevBodies.length
    expect(await spoilers('hn-1~30')).toEqual({ ids: [], pending: true })
    await Promise.all(background)
    const check = jevBodies.slice(asked)
    expect(check).toHaveLength(1)
    expect(Object.keys(check[0].questions)).toHaveLength(30)
    // Reading order across the whole thread: the first top-level comment, then its replies.
    expect(await spoilers('hn-1~30')).toEqual({ ids: ['1001'], pending: false })
    expect(jevBodies).toHaveLength(asked + 1)

    // A thread its grade doesn't call fiction is never checked, whatever the caller asks.
    const { kv } = await import('./kv')
    await kv().set('rd:spice:hn-9', JSON.stringify(grade({ insights: { sad: 0, delighted: 0, warm: 0, political: 0, fiction: 0.2, disputed: [], answers: [] } })), 600)
    expect(await spoilers('hn-9~5000')).toEqual({ ids: [], pending: false })
    expect(await spoilers('hn-404~5000')).toEqual({ ids: [], pending: false })
    expect(jevBodies).toHaveLength(asked + 1)
  })

  it('checks spoilers only within the lock, the reader’s share and the day’s budget', async () => {
    const { kv } = await import('./kv')
    const { clientKey, today } = await import('./http')
    const fiction = grade({ v: GRADE_VERSION, insights: { sad: 0, delighted: 0, warm: 0, political: 0, fiction: 0.9, disputed: [], answers: [] } })
    const ask = async (key: string, from = '198.51.100.1') =>
      (await (await spice.GET(new Request(`https://readout.test/api/spice?spoilers=${key}~40`, { headers: { 'x-forwarded-for': from } }))).json()) as SpoilerResponse
    const asked = jevBodies.length

    // Someone is already checking this thread: wait for them.
    await kv().set('rd:spice:hn-21', JSON.stringify(fiction), 600)
    await kv().set('rd:spoiler-lock:hn-21', '1', 300)
    expect(await ask('hn-21')).toEqual({ ids: [], pending: true })

    // The day's budget is spent: nothing starts, and the lock is let go for whoever comes next.
    await kv().set('rd:spice:hn-22', JSON.stringify(fiction), 600)
    await kv().set(`rd:spoiler-budget:${today()}`, '100000', 600)
    expect(await ask('hn-22')).toEqual({ ids: [], pending: false })
    expect(Number(await kv().get('rd:spoiler-lock:hn-22'))).toBe(0)

    // This reader has used their share: nothing starts for them either.
    await kv().set(`rd:spoiler-budget:${today()}`, '0', 600)
    await kv().set('rd:spice:hn-23', JSON.stringify(fiction), 600)
    const reader = new Request('https://readout.test/', { headers: { 'x-forwarded-for': '198.51.100.9' } })
    await kv().set(`rd:spice-caller:${clientKey(reader)}:${today()}`, '100000', 600)
    expect(await ask('hn-23', '198.51.100.9')).toEqual({ ids: [], pending: false })

    await Promise.allSettled(background)
    expect(jevBodies).toHaveLength(asked)
  })

  it('rests a source that rate-limited the server', async () => {
    const { kv } = await import('./kv')
    await kv().set('rd:spice-cool:lb', '1', 600)
    const res = await get('lb-abc~40,hn-2~30')
    expect(res.pending).toEqual(['hn-2'])
    await Promise.all(background)
  })
})
