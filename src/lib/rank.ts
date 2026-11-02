import { clusterEvents } from './cluster'
import { storyFeatures, tasteFactor } from './features'
import { topicsForStory, type Topic } from './topics'
import type { SourceKind, Story } from './types'

export interface Ranked extends Story {
  /** 0..1 from absolute engagement, comparable across sources. Drives the signal meter. */
  heat: number
  /** Same link seen on other sources. */
  alsoOn: Story[]
  /** Other links about the same event (another outlet's article, a thread on it elsewhere). */
  coverage?: Story[]
  topics: string[]
}

/** Spicy ranks like hot, then puts the most heated discussions first (hooks.ts, spice.ts). */
export type SortMode = 'hot' | 'new' | 'top' | 'spicy'

/** Shared: a link, paper, repo, image or video. Discussions are the conversation itself (Ask HN, a Bluesky text post). */
export type StoryKind = 'shared' | 'discussions'

export const kindOf = (s: Pick<Story, 'url' | 'hasThread' | 'media'>): StoryKind => (!s.url && !s.media?.length && s.hasThread ? 'discussions' : 'shared')

const TRACKING = /^(utm_|ref$|ref_src$|source$|fbclid$|gclid$|mc_|s$|si$)/

export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw)
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k)
    const host = u.hostname.replace(/^(www|m|mobile|old)\./, '')
    const path = u.pathname.replace(/\/(index\.html?)?$/, '').replace(/\/+$/, '')
    // arXiv abs/pdf/html variants are the same paper.
    const arxiv = host === 'arxiv.org' && path.match(/^\/(abs|pdf|html)\/([\w.]+?)(v\d+)?(\.pdf)?$/)
    if (arxiv) return `arxiv.org/abs/${arxiv[2]}`
    const qs = u.searchParams.toString()
    return `${host}${path}${qs ? `?${qs}` : ''}`
  } catch {
    return raw
  }
}

/**
 * What a solid showing looks like on each source, so engagement can be compared across them.
 * A story at [score, comments] scores 100, about a good HN front-page story.
 */
const REFERENCE: Record<SourceKind, [score: number, comments: number]> = {
  hn: [100, 50],
  lobsters: [20, 10],
  bluesky: [150, 15],
  lemmy: [80, 25],
  mastodon: [40, 8],
  // Frontpage is small: a dozen votes is a good day there.
  frontpage: [12, 3],
  status: [0, 0],
  devto: [30, 5],
  hf: [20, 5],
  github: [200, 0],
  release: [0, 0],
  arxiv: [0, 0],
  rss: [0, 0],
}

/** Stories with no score at all (blogs, papers): a modest, curated story. */
const UNSCORED = 40
/** Past this, a viral post stops climbing; otherwise one story owns Hot for a day. */
const CAP = 800

const unscored = (s: Pick<Story, 'source' | 'score'>) => !REFERENCE[s.source]?.[0] || s.score === undefined

/**
 * Social networks, where a like mostly measures the author's following: a big account's one-liner
 * collects hundreds without anyone discussing it. There, replies count for more than likes.
 */
const SOCIAL = new Set<SourceKind>(['bluesky', 'mastodon'])

/** Engagement in HN-equivalent points: score weighted 0.7 and comments 0.3, or 0.4 and 0.6 on social networks. */
export function engagement(s: Pick<Story, 'source' | 'score' | 'comments' | 'weight'>): number {
  if (s.weight !== undefined) return Math.min(CAP, s.weight)
  const [refScore, refComments] = REFERENCE[s.source] ?? [0, 0]
  if (!refScore || s.score === undefined) return UNSCORED
  const score = s.score / refScore
  if (!refComments || s.comments === undefined) return Math.min(CAP, 100 * score)
  const w = SOCIAL.has(s.source) ? 0.4 : 0.7
  return Math.min(CAP, 100 * (w * score + (1 - w) * (s.comments / refComments)))
}

/** In a feed that mixes in news sources, a social post with nothing to share is commentary: it has to be twice as busy. */
const COMMENTARY = 0.5
/** Posts from people you follow on Mastodon. */
const FOLLOWED = 1.5

export interface Filters {
  mutedWords: string[]
  mutedDomains: string[]
  hidden: Record<string, number>
}

function isMuted(s: Story, f: Filters): boolean {
  if (f.hidden[s.key]) return true
  const title = s.title.toLowerCase()
  if (f.mutedWords.some((w) => w && title.includes(w.toLowerCase()))) return true
  if (s.url && f.mutedDomains.length) {
    try {
      const host = new URL(s.url).hostname
      if (f.mutedDomains.some((d) => d && (host === d || host.endsWith('.' + d)))) return true
    } catch {
      /* ignore */
    }
  }
  return false
}

export interface MergeOptions {
  sort: SortMode
  /** Keep the first batch's order for "hot" (a single-source channel like HN top). */
  native?: boolean
  /** Topic ids that get a ranking boost (followed interests on "For you"). */
  boost?: string[]
  extraTopics?: Topic[]
  filters: Filters
  /** Sessions each story has been on screen unopened; repeats sink in hot. A snapshot, so rows don't move mid-scroll. */
  seen?: Record<string, number>
  /** Your taste profile (features.ts): feature -> -3..3, from votes, saves, hides and More/Fewer. */
  affinity?: Record<string, number>
  /** Your own votes: a story you voted down sinks, one you voted up rises, whatever it resembles. */
  votes?: Record<string, 1 | -1>
}

/** What your own vote on a story does to that story. */
const VOTED = { 1: 1.3, '-1': 0.3 } as const

export const domainKey = (url?: string | null) => {
  try {
    return url ? `d:${new URL(url).hostname.replace(/^www\./, '')}` : undefined
  } catch {
    return undefined
  }
}

/** How much your saves, hides and "more/fewer like this" lift or sink a story. */
/** How much a story resembles your taste (votes, saves, hides, More and Fewer): see features.ts. */
export function affinityFactor(r: Story & { topics: string[] }, affinity: Record<string, number> = {}): number {
  if (!Object.keys(affinity).length) return 1
  return tasteFactor(storyFeatures(r), affinity)
}

/** A ranked story back to a plain one, for nesting under another row. */
function plain(r: Ranked): Story {
  const copy = { ...r } as Partial<Ranked>
  delete copy.alsoOn
  delete copy.coverage
  delete copy.heat
  delete copy.topics
  return copy as Story
}

export function merge(batches: Story[][], opts: MergeOptions): Ranked[] {
  const byLink = new Map<string, Ranked>()
  const byKey = new Map<string, Ranked>()
  let order: Ranked[] = []
  const engagementOf = new Map<Ranked, number>()

  for (const batch of batches) {
    for (const s of batch) {
      if (byKey.has(s.key) || isMuted(s, opts.filters)) continue
      const e = engagement(s)
      const heat = e / (e + 60)
      const link = s.url ? canonicalUrl(s.url) : undefined
      const existing = link ? byLink.get(link) : undefined
      if (existing) {
        // Who shared it, and what they said, stays with the row whichever copy leads it.
        const sharedBy = [...new Set([...(existing.sharedBy ?? []), ...(s.sharedBy ?? [])])]
        const shareNote = existing.shareNote ?? s.shareNote
        const followed = existing.followed || s.followed
        // Keep the hotter copy as primary so the row links to the liveliest discussion.
        if (heat > existing.heat && s.hasThread) {
          const { alsoOn, topics, ...old } = existing
          Object.assign(existing, s, { alsoOn: [old as Story, ...alsoOn], topics })
        } else {
          existing.alsoOn.push(s)
        }
        if (sharedBy.length) existing.sharedBy = sharedBy
        if (shareNote) existing.shareNote = shareNote
        if (followed) existing.followed = true
        // Discussion in several places adds up.
        const total = Math.min(CAP, engagementOf.get(existing)! + e)
        engagementOf.set(existing, total)
        existing.heat = total / (total + 60)
        byKey.set(s.key, existing)
        continue
      }
      const r: Ranked = { ...s, heat, alsoOn: [], topics: topicsForStory(s, opts.extraTopics) }
      byKey.set(s.key, r)
      engagementOf.set(r, e)
      if (link) byLink.set(link, r)
      order.push(r)
    }
  }

  // Different links about one event become one row, led by the most engaged copy.
  if (!opts.native && order.length > 2) {
    const strongest = order.map((_, i) => i).sort((a, b) => engagementOf.get(order[b])! - engagementOf.get(order[a])!)
    const absorbed = new Set<number>()
    for (const [l, members] of clusterEvents(order, strongest)) {
      const leader = order[l]
      const coverage: Story[] = []
      let total = engagementOf.get(leader)!
      for (const m of members) {
        const r = order[m]
        coverage.push(plain(r), ...r.alsoOn)
        total += engagementOf.get(r)!
        for (const t of r.topics) if (!leader.topics.includes(t)) leader.topics.push(t)
        absorbed.add(m)
      }
      total = Math.min(CAP, total)
      engagementOf.set(leader, total)
      leader.coverage = coverage
      leader.heat = total / (total + 60)
    }
    if (absorbed.size) order = order.filter((_, i) => !absorbed.has(i))
  }

  if (opts.sort === 'new') return order.sort((a, b) => b.createdAt - a.createdAt)
  if (opts.sort === 'top') return order.sort((a, b) => b.heat - a.heat || (b.score ?? 0) - (a.score ?? 0))
  if (opts.native) return order

  const now = Date.now()
  const boost = new Set(opts.boost ?? [])
  const mixed = order.some((r) => !SOCIAL.has(r.source))
  const rank = (r: Ranked) => {
    const ageH = Math.max(0, (now - r.createdAt) / 3_600_000)
    const crossPosted = 1 + 0.2 * r.alsoOn.length
    const interest = boost.size && r.topics.some((t) => boost.has(t)) ? 1.3 : 1
    // Seen in two or more earlier sessions and never opened: it had its chance.
    const looks = opts.seen?.[r.key] ?? 0
    const stale = looks > 1 ? Math.max(0.35, 0.8 ** (looks - 1)) : 1
    const taste = affinityFactor(r, opts.affinity) * (opts.votes?.[r.key] ? VOTED[opts.votes[r.key]] : 1)
    // Someone you chose to follow said it: worth more than a stranger's post with the same numbers.
    const voice = r.followed ? FOLLOWED : mixed && SOCIAL.has(r.source) && kindOf(r) === 'discussions' ? COMMENTARY : 1
    // HN-style gravity on engagement, damped so a big story doesn't swamp everything fresh.
    // Votes decay fast because they arrive fast. Blogs, papers and releases have no votes, so a
    // two-day-old post shouldn't be buried the way a two-day-old HN story is.
    const gravity = unscored(r) ? 1.3 : 1.5
    return (Math.pow(engagementOf.get(r)!, 0.8) * crossPosted * interest * stale * taste * voice) / Math.pow(ageH + 2, gravity)
  }
  const ranks = new Map(order.map((r) => [r, rank(r)]))
  return interleave(order, ranks)
}

/** Each story already placed from a source costs that source this much on its next one. */
const SOURCE_DECAY = 0.7
/** Blogs share the "rss" source, so one publisher also pays for its own run. */
const PUBLISHER_DECAY = 0.6

/**
 * Hot order with the sources split up. Picks greedily: a story's rank is discounted by how many
 * stories from its source (and, for blogs, its publisher) are already above it. A strong story
 * still leads; a source just has to earn its fifth slot more than its first.
 */
function interleave(stories: Ranked[], ranks: Map<Ranked, number>): Ranked[] {
  const queues = new Map<string, Ranked[]>()
  for (const r of stories) {
    const q = queues.get(r.source) ?? []
    q.push(r)
    queues.set(r.source, q)
  }
  if (queues.size < 2) return stories.sort((a, b) => ranks.get(b)! - ranks.get(a)!)
  for (const q of queues.values()) q.sort((a, b) => ranks.get(b)! - ranks.get(a)!)
  const placed = new Map<string, number>()
  const out: Ranked[] = []
  const value = (r: Ranked) => ranks.get(r)! * SOURCE_DECAY ** (placed.get(r.source) ?? 0) * PUBLISHER_DECAY ** (r.source === 'rss' ? (placed.get(`rss:${r.sourceLabel}`) ?? 0) : 0)
  while (queues.size) {
    let best: { q: Ranked[]; i: number; v: number } | undefined
    for (const q of queues.values()) {
      // Within blogs, a publisher's discount can reorder the queue, so look past the head.
      const depth = q[0].source === 'rss' ? Math.min(q.length, 8) : 1
      for (let i = 0; i < depth; i++) {
        const v = value(q[i])
        if (!best || v > best.v) best = { q, i, v }
      }
    }
    const [r] = best!.q.splice(best!.i, 1)
    if (!best!.q.length) queues.delete(r.source)
    out.push(r)
    placed.set(r.source, (placed.get(r.source) ?? 0) + 1)
    if (r.source === 'rss') placed.set(`rss:${r.sourceLabel}`, (placed.get(`rss:${r.sourceLabel}`) ?? 0) + 1)
  }
  return out
}
