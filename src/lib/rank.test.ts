import { afterEach, describe, expect, it, vi } from 'vitest'
import { affinityFactor, canonicalUrl, caughtUpAt, engagement, merge } from './rank'
import type { Story } from './types'

const filters = { mutedWords: [], mutedDomains: [], hidden: {} }
const s = (key: string, url: string | null, score: number, extra: Partial<Story> = {}): Story => ({
  key,
  source: 'hn',
  sourceLabel: 'Hacker News',
  title: key,
  url,
  discussionUrl: null,
  score,
  comments: 0,
  createdAt: Date.now() - 3_600_000,
  hasThread: true,
  ...extra,
})

describe('canonicalUrl', () => {
  it('strips tracking params, www and trailing slashes', () => {
    expect(canonicalUrl('https://www.example.com/post/?utm_source=x&id=2')).toBe('example.com/post?id=2')
  })
  it('treats arXiv abs, pdf and versioned links as one paper', () => {
    expect(canonicalUrl('https://arxiv.org/pdf/2410.12345v2')).toBe(canonicalUrl('http://arxiv.org/abs/2410.12345'))
  })
})

describe('merge', () => {
  it('keeps a pinned announcement leading its row: a busier copy of the same link can’t take the pin', () => {
    const announcement = s('bs-welcome', 'https://paperwing.io/blog/welcome', 0, { source: 'bluesky', sourceLabel: 'PaperWing', pinned: true })
    const busier = s('hn-9', 'https://paperwing.io/blog/welcome', 500)
    const [row] = merge([[announcement], [busier]], { sort: 'hot', filters })
    expect(row).toMatchObject({ key: 'bs-welcome', pinned: true })
    expect(row.alsoOn.map((a) => a.key)).toEqual(['hn-9'])
    // The other way round, the pinned copy takes the row.
    const [other] = merge([[busier], [announcement]], { sort: 'hot', filters })
    expect(other).toMatchObject({ key: 'bs-welcome', pinned: true })
  })

  it('ranks a suggestion from a board you haven’t joined below an equal story you chose', () => {
    const chosen = s('hn-chosen', 'https://a.example/chosen', 50)
    const suggested = s('hn-suggested', 'https://a.example/suggested', 50, { recommended: true })
    expect(merge([[suggested], [chosen]], { sort: 'hot', filters }).map((r) => r.key)).toEqual(['hn-chosen', 'hn-suggested'])
  })

  it('is a suggestion only while every copy of it is: a link you chose too is yours', () => {
    const chosen = s('hn-mine', 'https://a.example/same', 10)
    const suggested = s('bs-pick', 'https://a.example/same', 300, { source: 'bluesky', recommended: true })
    for (const batches of [
      [[chosen], [suggested]],
      [[suggested], [chosen]],
    ]) {
      const [row] = merge(batches, { sort: 'hot', filters })
      expect(row.recommended).toBeFalsy()
    }
    expect(merge([[suggested]], { sort: 'hot', filters })[0].recommended).toBe(true)
  })

  it('leads Hot with an official announcement PaperWing pinned, however quiet it is so far', () => {
    const busy = [s('hn-1', 'https://a.example/1', 900), s('hn-2', 'https://a.example/2', 400)]
    const announcement = s('bs-welcome', null, 0, { source: 'bluesky', sourceLabel: 'PaperWing', pinned: true, comments: 0 })
    const hot = merge([busy, [announcement]], { sort: 'hot', filters })
    expect(hot[0].key).toBe('bs-welcome')
    // Latest and Top keep their own order; hiding it still hides it.
    expect(merge([busy, [announcement]], { sort: 'top', filters })[0].key).toBe('hn-1')
    expect(merge([busy, [announcement]], { sort: 'hot', filters: { ...filters, hidden: { 'bs-welcome': 1 } } }).map((r) => r.key)).not.toContain('bs-welcome')
  })

  it('keeps who shared a link, and their note, whichever copy leads the row', () => {
    const shared = s('ln-x', 'https://example.com/a', 0, { source: 'rss', hasThread: false, sharedBy: ['ann.example'], shareNote: 'Read this', followed: true })
    const hn = s('hn-1', 'https://example.com/a', 300, { comments: 80 })
    for (const batches of [
      [[shared], [hn]],
      [[hn], [shared]],
    ]) {
      const [row] = merge(batches, { sort: 'hot', filters: { mutedWords: [], mutedDomains: [], hidden: {} } })
      expect([row.key, row.sharedBy, row.shareNote, row.followed]).toEqual(['hn-1', ['ann.example'], 'Read this', true])
    }
  })
  it('dedupes the same link across sources and keeps the hotter thread as primary', () => {
    const out = merge([[s('hn-1', 'https://a.dev/x', 10), s('hn-2', 'https://b.dev', 500)], [s('lb-1', 'https://www.a.dev/x/', 900, { source: 'lobsters', sourceLabel: 'Lobsters' })]], {
      sort: 'hot',
      filters,
    })
    expect(out).toHaveLength(2)
    const a = out.find((r) => r.url?.includes('a.dev'))!
    expect(a.key).toBe('lb-1')
    expect(a.alsoOn.map((x) => x.key)).toEqual(['hn-1'])
  })
  it('leads with the busiest discussion of three, not one that beats the rest put together', () => {
    const url = 'https://a.dev/x'
    const [row] = merge([[s('lb-1', url, 0, { weight: 100 })], [s('bs-1', url, 0, { weight: 50 })], [s('lm-1', url, 0, { weight: 120 })]], { sort: 'hot', filters })
    expect(row.key).toBe('lm-1')
    expect(row.alsoOn.map((x) => x.key).sort()).toEqual(['bs-1', 'lb-1'])
  })
  it('applies muted words and hidden keys', () => {
    const out = merge([[s('hn-1', null, 1, { title: 'Crypto pump' }), s('hn-2', null, 1), s('hn-3', null, 1)]], {
      sort: 'new',
      filters: { mutedWords: ['crypto'], mutedDomains: [], hidden: { 'hn-3': 1 } },
    })
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
        [
          s('bs-1', 'https://guardian.com/elvis', 30, {
            source: 'bluesky',
            sourceLabel: 'Bluesky',
            comments: 4,
            title: 'Anthropic sued for allegedly using 274 Elvis Presley songs to train AI models',
          }),
        ],
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
    expect(merge([batch], { sort: 'hot', filters, memory: { 'hn-a': { looks: 3, at: Date.now() } } }).map((r) => r.key)).toEqual(['hn-b', 'hn-a'])
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

describe('Hot between visits', () => {
  const now = Date.now()
  const hour = 3_600_000
  const keys = (rows: { key: string }[]) => rows.map((r) => r.key)

  it('sinks a story you scrolled past on an earlier visit without opening, and lets it recover over a day', () => {
    const fresh = s('hn-fresh', 'https://a.example/fresh', 60)
    const seen = s('hn-seen', 'https://a.example/seen', 60)
    expect(keys(merge([[seen, fresh]], { sort: 'hot', filters, memory: { 'hn-seen': { looks: 1, at: now - hour } } }))).toEqual(['hn-fresh', 'hn-seen'])
    // A day and more later it has mostly recovered: a much stronger story it was seen beside is still worth seeing.
    const strong = s('hn-strong', 'https://a.example/strong', 200)
    const ranked = merge([[fresh, strong]], { sort: 'hot', filters, memory: { 'hn-strong': { looks: 1, at: now - 48 * hour } } })
    expect(keys(ranked)[0]).toBe('hn-strong')
  })

  it('sinks a story you opened on an earlier visit well below fresh ones', () => {
    const opened = s('hn-opened', 'https://a.example/opened', 200)
    const quiet = s('hn-quiet', 'https://a.example/quiet', 40)
    expect(keys(merge([[opened, quiet]], { sort: 'hot', filters, memory: { 'hn-opened': { looks: 1, at: now - hour, openedAt: now - hour } } }))).toEqual(['hn-quiet', 'hn-opened'])
  })

  it('brings back a story you’d seen when its discussion has really grown, saying by how much', () => {
    const opened = s('hn-opened', 'https://a.example/opened', 200, { comments: 90 })
    const quiet = s('hn-quiet', 'https://a.example/quiet', 40)
    const ranked = merge([[opened, quiet]], { sort: 'hot', filters, memory: { 'hn-opened': { looks: 1, at: now - hour, openedAt: now - hour, comments: 30 } } })
    expect(keys(ranked)).toEqual(['hn-opened', 'hn-quiet'])
    expect(ranked[0].sinceSeen).toEqual({ comments: 60 })
    // A few more comments isn't news.
    const little = merge([[{ ...opened, comments: 34 }, quiet]], { sort: 'hot', filters, memory: { 'hn-opened': { looks: 1, at: now - hour, openedAt: now - hour, comments: 30 } } })
    expect(little.find((r) => r.key === 'hn-opened')?.sinceSeen).toBeUndefined()
  })

  it('marks what you’ve seen before, so Hot can say where you’re caught up', () => {
    const a = s('hn-a', 'https://a.example/a', 100)
    const b = s('hn-b', 'https://a.example/b', 90)
    const c = s('hn-c', 'https://a.example/c', 80)
    const ranked = merge([[a, b, c]], { sort: 'hot', filters, memory: { 'hn-b': { looks: 1, at: now - hour }, 'hn-c': { looks: 2, at: now - hour } } })
    expect(ranked.map((r) => [r.key, !!r.seenBefore])).toEqual([
      ['hn-a', false],
      ['hn-b', true],
      ['hn-c', true],
    ])
    expect(caughtUpAt(ranked)).toBe(1)
    expect(caughtUpAt(ranked.slice(0, 1))).toBeUndefined()
    expect(caughtUpAt(ranked.slice(1))).toBeUndefined()
    // A real Hot list: new first, then mostly what you've seen, with quiet new stories mixed in below.
    const row = (seenBefore: boolean, sinceSeen?: { comments: number }) => ({ seenBefore, sinceSeen })
    const list = [row(false), row(false), row(true, { comments: 40 }), row(false), row(true), row(true), row(false), row(true), row(true), row(true), row(false)]
    // The story back with new comments isn't where you're caught up; the turn is where seen ones take over.
    expect(caughtUpAt(list)).toBe(4)
    // One seen story among new ones isn't the turn.
    expect(caughtUpAt([row(false), row(true), row(false), row(false), row(false), row(false), row(false)])).toBeUndefined()
  })
})

describe('Hot rewards what’s moving, not what’s fighting', () => {
  const keys = (rows: { key: string }[]) => rows.map((r) => r.key)

  it('lifts a story gaining points fast right now over an equal one that isn’t', () => {
    const a = s('hn-a', 'https://a.example/a', 60)
    const b = s('hn-b', 'https://a.example/b', 60)
    expect(keys(merge([[a, b]], { sort: 'hot', filters, momentum: { 'hn-b': 120 } }))).toEqual(['hn-b', 'hn-a'])
  })

  it('holds back a flamewar, where comments far outrun votes, as Hacker News does', () => {
    const calm = s('hn-calm', 'https://a.example/calm', 120, { comments: 60 })
    const fight = s('hn-fight', 'https://a.example/fight', 120, { comments: 400 })
    expect(keys(merge([[fight, calm]], { sort: 'hot', filters }))).toEqual(['hn-calm', 'hn-fight'])
    // Held back, not buried: a busy flamewar still beats a quiet story.
    const quietOne = s('hn-quiet1', 'https://a.example/quiet1', 10, { comments: 2 })
    expect(keys(merge([[fight, quietOne]], { sort: 'hot', filters }))[0]).toBe('hn-fight')
    // Social posts count replies as their engagement: no votes to weigh them against.
    const thread = s('bs-thread', 'https://a.example/thread', 50, { source: 'bluesky', comments: 400 })
    const calmPost = s('bs-calm', 'https://a.example/calmpost', 50, { source: 'bluesky', comments: 20 })
    expect(keys(merge([[calmPost, thread]], { sort: 'hot', filters }))[0]).toBe('bs-thread')
    // A small thread with more comments than votes is just a conversation.
    const chat = s('hn-chat', 'https://a.example/chat', 10, { comments: 30 })
    const quiet = s('hn-quiet', 'https://a.example/quiet', 10, { comments: 2 })
    expect(keys(merge([[quiet, chat]], { sort: 'hot', filters }))).toEqual(['hn-chat', 'hn-quiet'])
  })
})

describe('Hot spreads things out', () => {
  const keys = (rows: { key: string }[]) => rows.map((r) => r.key)

  it('makes one site earn its second and third slots', () => {
    const same = [0, 1, 2].map((i) => s(`hn-big${i}`, `https://big.example/${i}`, 100 - i))
    const other = s('hn-other', 'https://small.example/x', 70)
    expect(keys(merge([[...same, other]], { sort: 'hot', filters })).indexOf('hn-other')).toBeLessThan(3)
  })

  it('makes one person earn their second slot on social networks', () => {
    const posts = [0, 1, 2].map((i) => s(`bs-${i}`, `https://link${i}.example/x`, 300 - i, { source: 'bluesky', author: 'prolific.example' }))
    const other = s('bs-other', 'https://other.example/x', 250, { source: 'bluesky', author: 'someone.example' })
    expect(keys(merge([[...posts, other]], { sort: 'hot', filters })).indexOf('bs-other')).toBe(1)
  })

  it('doesn’t charge a source whose stories all come from one site twice for it', () => {
    // Papers all come from arxiv.org: as a source they already pay for repeats, so they alternate with HN stories.
    const at = Date.now() - 3_600_000
    const papers = [0, 1, 2].map((i) => s(`ax-${i}`, `https://arxiv.org/abs/2410.0000${i}`, 100, { source: 'arxiv', score: undefined, weight: 70, createdAt: at }))
    const stories = [0, 1, 2].map((i) => s(`hn-${i}`, `https://site${i}.example/x`, 100, { createdAt: at }))
    // (A third paper may wait: papers share a topic, and topics earn their repeats too.)
    expect(
      keys(merge([papers, stories], { sort: 'hot', filters }))
        .slice(0, 4)
        .map((k) => k.slice(0, 2)),
    ).toEqual(['ax', 'hn', 'ax', 'hn'])
  })

  it('puts a few strong stories from outside your usual into For you, labelled, never ones you’ve turned from', () => {
    // Things you've voted up a lot, each its own subject, lifted well above their numbers.
    const liked = Array.from({ length: 20 }, (_, i) => s(`hn-liked${i}`, `https://liked${i}.example/x`, 60 + i, { title: `zorblax ${'abcdefghijklmnopqrst'[i]}quux` }))
    // Busier than any of them, and nothing your taste has a view on.
    const outside = s('hn-outside', 'https://elsewhere.example/x', 120, { title: 'octopus behaviour' })
    const disliked = s('hn-disliked', 'https://meh.example/x', 400, { title: 'celebrity gossip roundup' })
    const affinity = { 'k:zorblax': 3, 'k:celebrity': -3, 'k:gossip': -3, 'd:meh.example': -3 }
    const ranked = merge([[...liked, outside, disliked]], { sort: 'hot', filters, affinity, explore: true })
    const picks = ranked.filter((r) => r.explore)
    expect(picks.map((r) => r.key)).toEqual(['hn-outside'])
    expect(ranked.findIndex((r) => r.explore)).toBeGreaterThanOrEqual(5)
    expect(merge([[...liked, outside]], { sort: 'hot', filters, affinity }).some((r) => r.explore)).toBe(false)
    // Nothing to explore from without a taste profile.
    expect(merge([[...liked, outside]], { sort: 'hot', filters, explore: true }).some((r) => r.explore)).toBe(false)
  })

  it('only ever lifts a pick from outside your usual, never moves one down', () => {
    const liked = Array.from({ length: 30 }, (_, i) => s(`hn-liked${i}`, `https://liked${i}.example/x`, 60 + i, { title: `zorblax ${'abcdefghijklmnopqrstuvwxyzABCD'[i]}quux` }))
    const outside = [0, 1, 2, 3].map((i) => s(`hn-out${i}`, `https://out${i}.example/x`, 150 - i * 5, { title: `octopus ${'wxyz'[i]}fact` }))
    const affinity = { 'k:zorblax': 3 }
    const before = merge([[...liked, ...outside]], { sort: 'hot', filters, affinity })
    const after = merge([[...liked, ...outside]], { sort: 'hot', filters, affinity, explore: true })
    for (const r of after.filter((x) => x.explore)) expect(after.indexOf(r)).toBeLessThanOrEqual(before.findIndex((x) => x.key === r.key))
    expect(after.filter((x) => x.explore).length).toBeGreaterThan(0)
  })
})

describe('checking Hot through the day (a replay)', () => {
  afterEach(() => vi.useRealTimers())

  it('shows mostly new stories at the top of each visit, says where you’re caught up, and never buries a big new one', () => {
    const hour = 3_600_000
    vi.useFakeTimers({ toFake: ['Date'] })
    let now = Date.parse('2026-11-03T07:00:00Z')
    vi.setSystemTime(now)
    let n = 0
    const feed: Story[] = []
    // Stories arrive through the day, scores spread out; you look every three hours.
    const arrive = (count: number, overHours: number) => {
      for (let i = 0; i < count; i++, n++) feed.push(s(`hn-${n}`, `https://site${n}.example/x`, 30 + ((n * 37) % 200), { createdAt: now - (i % overHours) * hour, comments: 5 }))
    }
    arrive(40, 12)
    const memory: Record<string, { looks: number; at: number; comments?: number; openedAt?: number }> = {}
    const fresh: number[] = []
    for (let visit = 0; visit < 5; visit++) {
      const ranked = merge([feed], { sort: 'hot', filters, memory })
      const top = ranked.slice(0, 10)
      fresh.push(top.filter((r) => !memory[r.key]).length)
      if (visit > 0) expect(caughtUpAt(ranked)).toBeDefined()
      for (const r of top) memory[r.key] = { looks: (memory[r.key]?.looks ?? 0) + 1, at: now, comments: r.comments }
      // You open two of what you see.
      for (const r of top.slice(0, 2)) memory[r.key].openedAt = now
      now += 3 * hour
      vi.setSystemTime(now)
      arrive(8, 3)
    }
    expect(fresh[0]).toBe(10)
    for (const f of fresh.slice(1)) expect(f).toBeGreaterThanOrEqual(7)
    // A story you opened whose discussion took off comes back, saying so.
    const opened = Object.keys(memory).find((k) => memory[k].openedAt)!
    const story = feed.find((x) => x.key === opened)!
    story.comments = 120
    expect(merge([feed], { sort: 'hot', filters, memory }).find((r) => r.key === opened)?.sinceSeen).toEqual({ comments: 115 })
    // A huge story posted since still leads, however much you've already seen.
    feed.push(s('hn-big', 'https://big.example/x', 900, { createdAt: now - hour }))
    expect(merge([feed], { sort: 'hot', filters, memory })[0].key).toBe('hn-big')
  })
})
