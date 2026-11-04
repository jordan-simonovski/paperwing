import { GENERAL_TOPICS } from './packs.js'
import { TECH_TOPICS } from './techTopics.js'
import type { Story } from './types.js'

export { WARN_STATES } from './techTopics.js'

export type FeedRef =
  | { kind: 'hn'; list: 'top' | 'new' | 'best' | 'ask' | 'show' }
  /** `topic` re-checks results against that topic's terms; `anyWord` ORs the query words. */
  | { kind: 'hnSearch'; query: string; topic?: string; anyWord?: boolean }
  | { kind: 'lobsters'; path: string }
  | { kind: 'devto'; tag: string }
  | { kind: 'rss'; url: string; label: string }
  | { kind: 'standard'; url: string; label: string }
  | { kind: 'arxiv'; q: string }
  | { kind: 'hf' }
  | { kind: 'github'; q: string }
  /** One of PaperWing's own Bluesky feeds (src/lib/bskyFeeds.ts), served by api/atproto.ts. */
  | { kind: 'releases'; repos: string[] }
  | { kind: 'bluesky'; feed: string }
  /** A Lemmy community as programming.dev sees it ("technology@lemmy.world"). `topic` re-checks posts against that topic. */
  | { kind: 'frontpage'; feed: 'hot' | 'new' | 'top' }
  | { kind: 'bskyFeed'; uri: string; name: string }
  | { kind: 'lemmy'; community: string; sort?: 'Hot' | 'Active' | 'New' | 'TopDay' | 'TopWeek'; topic?: string; via?: string }
  /** PaperWing's own front page (submissions: Bluesky posts listed on PaperWing), or one board. */
  | { kind: 'paperwing'; sort: 'hot' | 'new' | 'top'; board?: string }
  /** Headlines from anywhere matching a search (news search RSS): what makes a free-text interest work for any subject. */
  | { kind: 'news'; q: string }
  /** Mastodon through the reader's server: its tech trends, hashtags, or their home timeline. */
  | { kind: 'mastodon'; feed: 'trends' | 'home' | 'tags'; tags?: string[]; topic?: string; topics?: string[] }
  /** What someone has listed on PaperWing, newest first (api/_lib/people.ts). `actor` is a handle or DID. */
  | { kind: 'person'; actor: string; label?: string }
  /** A community board's listings (api/_lib/boards.ts). */
  | { kind: 'board'; did: string; rkey: string; sort: 'hot' | 'new' | 'top'; name?: string }
  /** The liveliest community boards' best posts, suggested in For you: the same for everyone. */
  | { kind: 'boardpicks' }
  /** Incidents from providers' status pages (api/_lib/statuspages.ts); every provider when `providers` is unset. */
  | { kind: 'status'; providers?: string[]; active?: boolean; hosts?: string[] }
  /** One state's WARN notices (layoff filings) from employers PaperWing follows, by its two-letter code. */
  | { kind: 'warn'; state: string }

export type ClusterId = 'intelligence' | 'systems' | 'code' | 'world' | 'news' | 'science' | 'culture' | 'sport' | 'making' | 'life'

/** Topics come in packs: tech (where PaperWing started) and everything else. */
export type Pack = 'tech' | 'general'

export const CLUSTERS: Record<ClusterId, { label: string; blurb: string; pack: Pack }> = {
  news: { label: 'News', blurb: 'The world, its politics and its money', pack: 'general' },
  science: { label: 'Science', blurb: 'Findings, fields and the papers behind them', pack: 'general' },
  culture: { label: 'Culture', blurb: 'Screens, records, books and games', pack: 'general' },
  sport: { label: 'Sport', blurb: 'Find your sport, follow your team or try something new', pack: 'general' },
  making: { label: 'Making', blurb: 'Printers, circuits and things people build', pack: 'general' },
  life: { label: 'Life', blurb: 'The everyday good stuff', pack: 'general' },
  intelligence: { label: 'Intelligence', blurb: 'Models, agents, papers and the hardware under them', pack: 'tech' },
  systems: { label: 'Systems', blurb: 'Running software in production and knowing what it is doing', pack: 'tech' },
  code: { label: 'Code', blurb: 'Languages, craft and the open source commons', pack: 'tech' },
  world: { label: 'Industry', blurb: 'Security, hardware and the industry around it', pack: 'tech' },
}

export interface Topic {
  id: string
  label: string
  hue: number
  cluster: ClusterId
  blurb: string
  /** Search-only names and groups; never used to tag stories. */
  aliases?: string[]
  /** Curated starting points that stay available above the latest stories. */
  guides?: { label: string; url: string }[]
  /**
   * Match terms. Plain terms are case-insensitive whole words ("k8s", "open source").
   * A trailing * allows suffixes ("observab*"). A leading = is case-sensitive ("=Go").
   */
  terms: string[]
  related: string[]
  feeds: FeedRef[]
  /** HN keyword query. Results are re-checked against `terms` to drop noise. */
  hnQuery?: string
  /** GitHub repositories whose releases belong in this topic (the release radar). */
  repos?: string[]
  /**
   * Lemmy communities for this topic, busiest first. `check` re-checks a broad community's posts
   * against `terms`. `via` is the instance that reads it (programming.dev when unset).
   */
  lemmy?: { community: string; check?: boolean; via?: string }[]
  /**
   * Community-run Bluesky feeds for this topic, shown on its own page. `forYou` also reads it in
   * For you, for a topic whose conversation is the news (researchers sharing their papers).
   */
  bsky?: { uri: string; name: string; forYou?: boolean }[]
  /** Mastodon hashtags, without the #. */
  mastodon?: string[]
  /** Status pages whose incidents belong here, by id from api/_lib/statuspages.ts; 'all' for every one. */
  status?: string[] | 'all'
}

export const TOPICS: Topic[] = [...TECH_TOPICS, ...GENERAL_TOPICS]
export const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]))

/** Whether a topic belongs to the tech pack: a free-text interest counts as neither. */
export const isTechTopic = (id: string) => {
  const t = TOPIC_BY_ID.get(id)
  return !!t && CLUSTERS[t.cluster].pack === 'tech'
}

/* -------------------------------------------------------------- matching */

// `?` is left alone so terms like "released?" can mark an optional character.
const escape = (s: string) => s.replace(/[.^${}()|[\]\\/+]/g, '\\$&')

/** Compiles one match term (see Topic.terms for the syntax) into a whole-word regex. */
export function compileTerm(term: string): RegExp {
  return termPattern(term).re
}

/** A term that matches `text` exactly as written: whatever someone typed, none of it is term syntax. */
export const literalTerm = (text: string) => text.replace(/[.*+?^${}()|[\]\\/=]/g, '\\$&')

function termPattern(term: string): { re: RegExp; body: string; caseSensitive: boolean } {
  const caseSensitive = term.startsWith('=')
  let body = caseSensitive ? term.slice(1) : term
  // A trailing "*" means "and any ending"; an escaped one ("\*") is a star.
  const prefix = /(?<!\\)\*$/.test(body)
  if (prefix) body = body.slice(0, -1)
  // Terms containing a backslash are treated as pre-escaped regex.
  const src = `${(body.includes('\\') ? body : escape(body)).replace(/ /g, '[\\s-]+')}${prefix ? '[\\w-]*' : ''}`
  return { re: new RegExp(`(?<![\\w])${src}(?![\\w])`, caseSensitive ? '' : 'i'), body: src, caseSensitive }
}

// One regex per topic (two when some terms are case-sensitive) rather than one per term: a topic
// has a dozen or more terms and every story is checked against every topic, so this is the
// difference between a few hundred regex scans per story and a few dozen.
const compiled = new Map<string, RegExp[]>()
function patternsFor(topic: Pick<Topic, 'id' | 'terms'>): RegExp[] {
  const key = `${topic.id}\u0000${topic.terms.join('\u0000')}`
  let list = compiled.get(key)
  if (!list) {
    const groups: [string[], string[]] = [[], []]
    for (const term of topic.terms) {
      // A term that won't compile is dropped rather than taking every topic (and every feed) down with it.
      try {
        const { body, caseSensitive } = termPattern(term)
        groups[caseSensitive ? 1 : 0].push(`(?:${body})`)
      } catch {
        continue
      }
    }
    list = groups.flatMap((alts, i) => (alts.length ? [new RegExp(`(?<![\\w])(?:${alts.join('|')})(?![\\w])`, i === 0 ? 'i' : '')] : []))
    compiled.set(key, list)
  }
  return list
}

/** Topics a source is dedicated to: anything from r/sre is SRE even if the title doesn't say so. */
const DEDICATED = new Map<string, string[]>()
for (const t of TOPICS) {
  for (const f of t.feeds) {
    const labels =
      f.kind === 'rss'
        ? [f.label.toLowerCase()]
        : f.kind === 'devto'
          ? [`dev.to #${f.tag}`]
          : f.kind === 'lobsters' && f.path.startsWith('t/')
            ? []
            : f.kind === 'hf'
              ? ['hf papers']
              : f.kind === 'arxiv' && t.id === 'ml-research'
                ? ['arxiv']
                : []
    for (const l of labels) DEDICATED.set(l, [...(DEDICATED.get(l) ?? []), t.id])
  }
  // A dedicated Lemmy community's posts belong to the topic whatever they say (c/localllama is LLMs).
  for (const l of t.lemmy ?? []) {
    if (l.check) continue
    const label = `c/${l.community.split('@')[0].toLowerCase()}`
    DEDICATED.set(label, [...(DEDICATED.get(label) ?? []), t.id])
  }
}

const hosts = new Map<string, string>()
function hostOf(url: string | null | undefined): string {
  if (!url) return ''
  let host = hosts.get(url)
  if (host === undefined) {
    try {
      host = new URL(url).hostname
    } catch {
      host = ''
    }
    if (hosts.size > 5000) hosts.clear()
    hosts.set(url, host)
  }
  return host
}

export function storyText(s: Pick<Story, 'title' | 'tags' | 'url'>): string {
  return `${s.title} ${(s.tags ?? []).join(' ')} ${hostOf(s.url)}`
}

export function matchesTopic(topic: Pick<Topic, 'id' | 'terms'>, text: string): string | undefined {
  for (const re of patternsFor(topic)) {
    const m = text.match(re)
    if (m) return m[0]
  }
  return undefined
}

// The same stories are ranked again on every sort change, refresh and feed arrival, and their
// topics never change, so they're worked out once per story.
const storyTopics = new Map<string, string[]>()

export function topicsForStory(s: Story, extra: Topic[] = []): string[] {
  const text = storyText(s)
  const key = `${s.sourceLabel}\u0000${text}\u0000${extra.map((t) => `${t.id}=${t.terms.join(',')}`).join(';')}`
  const cached = storyTopics.get(key)
  // A copy: callers add to it (a cluster's leader takes its members' topics).
  if (cached) return [...cached]
  const found = new Set(DEDICATED.get(s.sourceLabel.toLowerCase()) ?? [])
  for (const t of [...TOPICS, ...extra]) if (!found.has(t.id) && matchesTopic(t, text)) found.add(t.id)
  const topics = [...found]
  if (storyTopics.size > 5000) storyTopics.clear()
  storyTopics.set(key, topics)
  return [...topics]
}

/* --------------------------------------------------------------- search */

export interface TopicHit {
  topic: Topic
  score: number
  /** Why it matched, e.g. the keyword "tracing". */
  via?: string
}

/** Finds topics for a free-text query: labels first, then keywords, then descriptions. */
export function searchTopics(query: string, topics: Topic[] = TOPICS): TopicHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: TopicHit[] = []
  for (const topic of topics) {
    const label = topic.label.toLowerCase()
    let score = 0
    let via: string | undefined
    if (label === q || topic.id === q) score = 10
    else if (label.startsWith(q)) score = 8
    else if (label.includes(q)) score = 6
    const alias = topic.aliases?.find((a) => a.toLowerCase() === q || (q.length >= 3 && a.toLowerCase().includes(q)))
    if (alias && score < 6) {
      score = 6
      via = alias
    }
    if (score < 6) {
      for (const term of topic.terms) {
        const plain = term.replace(/^=/, '').replace(/\*$/, '').replace(/\\/g, '').toLowerCase()
        if (plain === q) {
          score = Math.max(score, 7)
          via = plain
          break
        }
        if (q.length >= 2 && plain.startsWith(q)) {
          score = Math.max(score, 5)
          via ??= plain
        } else if (q.length >= 3 && q.startsWith(plain) && plain.length >= 3) {
          score = Math.max(score, 4)
          via ??= plain
        }
      }
    }
    if (!score && q.length >= 3 && matchesTopic(topic, query)) {
      score = 4
      via = q
    }
    if (!score && q.length >= 4 && topic.blurb.toLowerCase().includes(q)) score = 2
    if (!score && (q === CLUSTERS[topic.cluster].label.toLowerCase() || (q === 'sports' && topic.cluster === 'sport'))) score = 1
    if (score) hits.push({ topic, score, via })
  }
  return hits.sort((a, b) => b.score - a.score)
}

export function relatedTopics(ids: string[], exclude: string[] = ids): Topic[] {
  const out = new Map<string, Topic>()
  for (const id of ids) for (const r of TOPIC_BY_ID.get(id)?.related ?? []) if (!exclude.includes(r)) out.set(r, TOPIC_BY_ID.get(r)!)
  return [...out.values()]
}

/** Two topics that keep showing up together are probably related, even if not hand-linked. */
export function cooccurringTopics(stories: { topics: string[] }[], focus: string, limit = 4): string[] {
  const counts = new Map<string, number>()
  for (const s of stories) if (s.topics.includes(focus)) for (const t of s.topics) if (t !== focus) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([t]) => t)
}
