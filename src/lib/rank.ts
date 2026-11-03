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
  /** You saw it on an earlier visit (or opened it then): below these, you're caught up. */
  seenBefore?: boolean
  /** It's back because its discussion really grew since you last looked. */
  sinceSeen?: { comments: number }
  /** In For you from outside your usual: strong, and your taste has no view on it yet. */
  explore?: boolean
}

/** What you did with a story on earlier visits (reader.ts builds it; this visit doesn't count). */
export interface Memory {
  /** Earlier visits it was on screen. */
  looks: number
  /** When you last saw it. */
  at: number
  /** Its comments then, to tell whether it has really moved since. */
  comments?: number
  /** When you opened it, on an earlier visit. */
  openedAt?: number
}

/** Spicy ranks like hot, then puts the most heated discussions first (hooks.ts, spice.ts). */
export type SortMode = 'hot' | 'new' | 'top' | 'spicy'

/** Shared: a link, paper, repo, image or video. Discussions are the conversation itself (Ask HN, a Bluesky text post). */
export type StoryKind = 'shared' | 'discussions'

export const kindOf = (s: Pick<Story, 'url' | 'hasThread' | 'media'>): StoryKind => (!s.url && !s.media?.length && s.hasThread ? 'discussions' : 'shared')

const TRACKING = /^(utm_|ref$|ref_src$|source$|fbclid$|gclid$|mc_|s$|si$)/

const canonical = new Map<string, string>()

export function canonicalUrl(raw: string): string {
  let c = canonical.get(raw)
  if (c === undefined) {
    c = canonicalize(raw)
    if (canonical.size > 5000) canonical.clear()
    canonical.set(raw, c)
  }
  return c
}

function canonicalize(raw: string): string {
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
/** A suggestion from a board you haven't joined counts for less than what you chose. */
const SUGGESTED = 0.6

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
  /** What you did with each story on earlier visits: seen ones sink, opened ones more. Nothing from this visit, so rows don't move mid-scroll. */
  memory?: Record<string, Memory>
  /** HN-equivalent points an hour each story has been gaining between fetches (momentum.ts). */
  momentum?: Record<string, number>
  /** For you: a few strong stories from outside your usual, labelled. */
  explore?: boolean
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
  // The leading copy's own engagement: a row's heat adds up every copy, so it can't say which one is busiest.
  const leadOf = new Map<Ranked, number>()

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
        // A suggestion only while every copy of it is: a link you chose in your own feeds is yours.
        const recommended = existing.recommended && s.recommended
        // Keep the hotter copy as primary so the row links to the liveliest discussion.
        // PaperWing's pinned announcement keeps its row (and takes it): no other copy carries the pin.
        if (s.pinned || (!existing.pinned && e > leadOf.get(existing)! && s.hasThread)) {
          const { alsoOn, topics, ...old } = existing
          Object.assign(existing, s, { alsoOn: [old as Story, ...alsoOn], topics })
          leadOf.set(existing, e)
        } else {
          existing.alsoOn.push(s)
        }
        if (sharedBy.length) existing.sharedBy = sharedBy
        if (shareNote) existing.shareNote = shareNote
        if (followed) existing.followed = true
        if (recommended) existing.recommended = true
        else delete existing.recommended
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
      leadOf.set(r, e)
      if (link) byLink.set(link, r)
      order.push(r)
    }
  }

  // Different links about one event become one row, led by the most engaged copy.
  if (!opts.native && order.length > 2) {
    // A pinned announcement is never folded into another row's coverage.
    const strongest = order
      .map((_, i) => i)
      .filter((i) => !order[i].pinned)
      .sort((a, b) => engagementOf.get(order[b])! - engagementOf.get(order[a])!)
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
        if (!r.recommended) delete leader.recommended
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
  for (const r of order) {
    const m = opts.memory?.[r.key]
    if (!m) continue
    r.seenBefore = true
    const grew = r.comments !== undefined && m.comments !== undefined ? r.comments - m.comments : 0
    if (grew >= Math.max(10, m.comments ?? 0)) r.sinceSeen = { comments: grew }
  }
  const rank = (r: Ranked) => {
    const ageH = Math.max(0, (now - r.createdAt) / 3_600_000)
    const crossPosted = 1 + 0.2 * r.alsoOn.length
    const interest = boost.size && r.topics.some((t) => boost.has(t)) ? 1.3 : 1
    const stale = staleness(opts.memory?.[r.key], r, now)
    // Gaining points fast right now: up to half again.
    const moving = 1 + 0.5 * Math.min(1, (opts.momentum?.[r.key] ?? 0) / 100)
    const fight = flamewar(r)
    const taste = affinityFactor(r, opts.affinity) * (opts.votes?.[r.key] ? VOTED[opts.votes[r.key]] : 1)
    // Someone you chose to follow said it: worth more than a stranger's post with the same numbers.
    const voice = r.followed ? FOLLOWED : mixed && SOCIAL.has(r.source) && kindOf(r) === 'discussions' ? COMMENTARY : 1
    // A suggestion from a board you haven't joined seasons the list; it doesn't take it over.
    const suggested = r.recommended ? SUGGESTED : 1
    // HN-style gravity on engagement, damped so a big story doesn't swamp everything fresh.
    // Votes decay fast because they arrive fast. Blogs, papers and releases have no votes, so a
    // two-day-old post shouldn't be buried the way a two-day-old HN story is.
    const gravity = unscored(r) ? 1.3 : 1.5
    return (Math.pow(engagementOf.get(r)!, 0.8) * crossPosted * interest * stale * moving * fight * taste * voice * suggested) / Math.pow(ageH + 2, gravity)
  }
  // PaperWing's official announcement leads Hot wherever its front page is part of the list, the
  // way it leads the front page: only the server pins, and only for its first few days.
  const pinned = order.filter((r) => r.pinned)
  const rest = pinned.length ? order.filter((r) => !r.pinned) : order
  const ranks = new Map(rest.map((r) => [r, rank(r)]))
  const spread = interleave(rest, ranks)
  return [...pinned, ...(opts.explore ? explore(spread, opts.affinity) : spread)]
}

/**
 * How far an earlier visit sinks a story: each visit it was on screen halves it (to a quarter at
 * most), recovering over a day, and opening it costs 85% more. A story whose discussion has really grown since
 * (sinceSeen) is worth another look: half a sink at most.
 */
function staleness(m: Memory | undefined, r: Ranked, now: number): number {
  if (!m) return 1
  const days = Math.max(0, (now - m.at) / 86_400_000)
  const looks = m.looks * 0.5 ** days
  const sunk = Math.max(0.25, 0.5 ** looks) * (m.openedAt ? 0.15 : 1)
  return r.sinceSeen ? Math.max(sunk, 0.6) : sunk
}

/**
 * Hacker News's flamewar rule: once a thread has 40 comments and more comments than votes, it's
 * held back by the square of the ratio, to at most 60% off. Social posts count replies as their
 * engagement and have no votes to weigh them against.
 */
function flamewar(r: Story): number {
  if (SOCIAL.has(r.source) || r.score === undefined || r.comments === undefined || r.comments < 40 || r.comments <= r.score) return 1
  return Math.max(0.4, (Math.max(1, r.score) / r.comments) ** 2)
}

/** Where For you's picks from outside your usual go, and how many at most. */
const EXPLORE_AT = [6, 16, 26]

/**
 * For you, with a few strong stories your taste has no view on yet: from the busiest third of the
 * list, not ones you've seen before or turned from, moved up into fixed slots and labelled, so
 * what you make of one teaches the profile something new.
 */
function explore(stories: Ranked[], affinity: Record<string, number> | undefined): Ranked[] {
  if (!affinity || !Object.keys(affinity).length || stories.length <= EXPLORE_AT[0]) return stories
  const busiest = [...stories].sort((a, b) => b.heat - a.heat)[Math.floor(stories.length / 3)]?.heat ?? 1
  const candidates = stories.filter((r, i) => {
    if (i < EXPLORE_AT[0] || r.seenBefore || r.heat < busiest) return false
    const f = affinityFactor(r, affinity)
    return f > 0.85 && f < 1.15
  })
  const out = [...stories]
  let next = 0
  for (const at of EXPLORE_AT) {
    if (at >= out.length) break
    // Only ever a lift: the next candidate still below this slot (an earlier lift can carry one past it).
    while (next < candidates.length && out.indexOf(candidates[next]) <= at) next++
    const pick = candidates[next++]
    if (!pick) break
    out.splice(out.indexOf(pick), 1)
    out.splice(at, 0, { ...pick, explore: true })
  }
  return out
}

/** How many stories after the turn must be ones you've seen, for it to be where you're caught up. */
const TURN = 5

/**
 * Where Hot turns to what you've seen before: the first story you've seen (not one back with new
 * comments) from which most of the next few are seen too, with something new above it. Quiet new
 * stories can still come below; one seen story among new ones isn't the turn.
 */
export function caughtUpAt(stories: Pick<Ranked, 'seenBefore' | 'sinceSeen'>[]): number | undefined {
  const seen = (r: Pick<Ranked, 'seenBefore' | 'sinceSeen'>) => !!r.seenBefore && !r.sinceSeen
  for (let i = 1; i < stories.length; i++) {
    if (!seen(stories[i]) || stories.slice(0, i).every(seen)) continue
    const next = stories.slice(i, i + TURN)
    if (next.filter(seen).length * 2 > next.length) return i
  }
  return undefined
}

/** Each story already placed from a source costs that source this much on its next one. */
const SOURCE_DECAY = 0.7
/** Blogs share the "rss" source, so one publisher also pays for its own run. */
const PUBLISHER_DECAY = 0.6
/** A site's or a person's next story: 1, 0.63, 0.44, 0.34… never below a quarter (X's author diversity). */
const repeat = (k: number) => 0.75 * 0.5 ** k + 0.25
/** A topic's next story costs a little, never below 0.6: a topic channel is all one topic, and that's fine. */
const topicRepeat = (k: number) => Math.max(0.6, 0.85 ** k)
/** How far down each source's own order to look for the next pick, now that sites and topics reorder it. */
const DEPTH = 8

/** What a story shares with the ones above it: its source, its blog, its site, its author and its main topic. */
/**
 * Sources whose stories link anywhere on the web, so a site can repeat among them. A blog pays as a
 * publisher already, a social post's link is often not the point, and papers, repos, releases and
 * the rest all come from one site each: they already pay as a source.
 */
const MANY_SITES = new Set<SourceKind>(['hn', 'lobsters', 'lemmy', 'frontpage'])

function groupsOf(r: Ranked): { source: string; publisher?: string; site?: string; author?: string; topic?: string } {
  const social = SOCIAL.has(r.source)
  return {
    source: `s:${r.source}`,
    publisher: r.source === 'rss' ? `rss:${r.sourceLabel}` : undefined,
    site: MANY_SITES.has(r.source) ? domainKey(r.url) : undefined,
    author: social && r.author ? `a:${r.author}` : undefined,
    topic: r.topics[0] ? `t:${r.topics[0]}` : undefined,
  }
}

/**
 * Hot order, spread out. Picks greedily: a story's rank is discounted by how many stories above it
 * share its source, its blog, its site, its author or its main topic. A strong story still leads; a
 * source, site or person just has to earn its fifth slot more than its first.
 */
function interleave(stories: Ranked[], ranks: Map<Ranked, number>): Ranked[] {
  const queues = new Map<string, Ranked[]>()
  for (const r of stories) {
    const q = queues.get(r.source) ?? []
    q.push(r)
    queues.set(r.source, q)
  }
  for (const q of queues.values()) q.sort((a, b) => ranks.get(b)! - ranks.get(a)!)
  const placed = new Map<string, number>()
  const count = (k?: string) => (k ? (placed.get(k) ?? 0) : 0)
  // Worked out once a story: the picker weighs each story many times over.
  const groups = new Map(stories.map((r) => [r, groupsOf(r)]))
  const value = (r: Ranked) => {
    const g = groups.get(r)!
    return ranks.get(r)! * SOURCE_DECAY ** count(g.source) * PUBLISHER_DECAY ** count(g.publisher) * repeat(count(g.site)) * repeat(count(g.author)) * topicRepeat(count(g.topic))
  }
  const out: Ranked[] = []
  while (queues.size) {
    let best: { q: Ranked[]; i: number; v: number } | undefined
    for (const q of queues.values()) {
      for (let i = 0; i < Math.min(q.length, DEPTH); i++) {
        const v = value(q[i])
        if (!best || v > best.v) best = { q, i, v }
      }
    }
    const [r] = best!.q.splice(best!.i, 1)
    if (!best!.q.length) queues.delete(r.source)
    out.push(r)
    for (const k of Object.values(groups.get(r)!)) if (k) placed.set(k, count(k) + 1)
  }
  return out
}
