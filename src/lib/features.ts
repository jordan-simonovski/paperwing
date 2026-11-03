import { topicsForStory } from './topics'
import type { Story } from './types'

// What a story is about, as weighted features, and how much it resembles what you've voted up.
// Votes, saves and hides add a story's features to a taste profile (or take them away); ranking
// multiplies each story by its similarity to that profile. Features are prefixed by kind:
//   t: topic          d: site            p: publisher (blog, status page)   c: Lemmy community
//   a: author         s: source          f: format (paper, repo, video…)    k: title keyword

export type Features = Map<string, number>

/**
 * How much each kind of feature says about taste. A topic says the most; any one keyword, little.
 * Source and the default "article" format are shared by most of a feed, so they stay faint: one
 * upvoted HN article shouldn't lift every HN article.
 */
const WEIGHT = { topic: 1, site: 0.8, publisher: 0.8, community: 0.8, author: 0.6, source: 0.25, format: 0.6, commonFormat: 0.2, keyword: 0.35 }
const MAX_TOPICS = 3
const MAX_KEYWORDS = 6

// Function words and the filler every tech headline shares, so keywords are what the story is about.
const STOP = new Set(
  (
    'the and for are but not all any can had her was one our out has his how its may new now old see two way who did get got let put say she too use via yes yet you your yours ' +
    'about after again also back been before being below between both does doing down during each even ever every from further have having here into just like made make makes ' +
    'many more most much must need only other over really same should show shows some still such than that their them then there these they thing things this those through ' +
    'under until very want what when where which while will with without would could year years today week weeks days time times first last best better good great big small ' +
    'ask tell hn why use using used uses work works working let lets get gets got going gone come comes look looks take takes give gives keep keeps start starts stop stops ' +
    'part people says said report reports here’s it’s don’t can’t i’m i’ve you’re we’re that’s what’s isn’t doesn’t didn’t won’t heres dont cant ive youre were thats whats ' +
    'isnt doesnt didnt wont against around because behind beyond despite inside instead little lot lots maybe nearly never often perhaps quite rather soon thanks though ' +
    'together toward towards upon whether within yourself ourselves themselves anyone everyone someone something everything nothing anything another ' +
    'built build building made making wrote writing created creating tried trying'
  ).split(/\s+/),
)

const hostOf = (url?: string | null) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : undefined
  } catch {
    return undefined
  }
}

/** Names that end in s, which plural folding would break. */
const KEEP_S = new Set([
  'kubernetes',
  'postgres',
  'redis',
  'macos',
  'ios',
  'ipados',
  'watchos',
  'jenkins',
  'rails',
  'express',
  'chaos',
  'news',
  'aws',
  'dns',
  'k8s',
  'sass',
  'mars',
  'atlas',
  'vitess',
  'pandas',
  'iris',
  'nats',
])

/** Title words worth remembering: names, products and terms, not grammar. "Kubernetes", "gpt-6.1", "c++". */
export function keywords(title: string): string[] {
  const out: string[] = []
  for (const raw of title.toLowerCase().split(/[^a-z0-9.+#\-’']+/)) {
    let w = raw.replace(/^[.\-'’]+|[.\-'’]+$/g, '').replace(/['’]s$/, '')
    if (w.length < 3 || STOP.has(w) || /^[\d.\-]+$/.test(w)) continue
    // Plurals fold into the singular, so "agents" and "agent" are one taste.
    if (w.length > 4 && w.endsWith('s') && !KEEP_S.has(w) && !/(ss|us|is|os)$/.test(w)) w = w.slice(0, -1)
    if (!out.includes(w)) out.push(w)
    if (out.length === MAX_KEYWORDS) break
  }
  return out
}

/** What kind of thing a story is, from where it came from and how its title reads. */
export function formatOf(s: Pick<Story, 'source' | 'title' | 'url' | 'media'>): string {
  const t = s.title.toLowerCase()
  const host = hostOf(s.url) ?? ''
  const path = (() => {
    try {
      return s.url ? new URL(s.url).pathname : ''
    } catch {
      return ''
    }
  })()
  if (s.source === 'status') return 'incident'
  if (s.source === 'release') return 'release'
  if (s.source === 'arxiv' || s.source === 'hf' || /(^|\.)(arxiv\.org|openreview\.net)$/.test(host) || /\.pdf$/i.test(path)) return 'paper'
  if (s.source === 'github' || (host === 'github.com' && /^\/[^/]+\/[^/]+\/?$/.test(path))) return 'repo'
  if (/(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/.test(host) || s.media?.some((m) => m.kind === 'video')) return 'video'
  if (/^show hn\b|^i (built|made|wrote|created)\b/.test(t)) return 'show'
  if (/^ask hn\b/.test(t) || (!s.url && t.endsWith('?'))) return 'question'
  if (/\b(post-?mortem|incident report|root cause|outage)\b/.test(t)) return 'postmortem'
  if (/\b(how to|how i|tutorial|guide to|a guide|introduction to|intro to|step by step|walkthrough|cheat ?sheet|explained)\b/.test(t)) return 'tutorial'
  if (/\b(announc\w*|introduc\w*|launch\w*|unveil\w*|now available|is out|v\d+(\.\d+)+)\b/.test(t)) return 'launch'
  if (/^(why|the case (for|against)|in defen[cs]e of|stop|you should|we need|i think)\b|\bconsidered harmful\b|\bis dead\b|\bis overrated\b/.test(t)) return 'opinion'
  if (!s.url && s.media?.length) return 'image'
  if (!s.url) return 'discussion'
  return 'article'
}

// Ranking recomputes often over the same stories; their features don't change.
const cache = new Map<string, Features>()

/** A story's features. `topics` when they're already known (ranked stories carry them). */
export function storyFeatures(s: Story & { topics?: string[] }): Features {
  const cacheKey = `${s.key}\u0000${s.title}`
  const hit = cache.get(cacheKey)
  if (hit) return hit
  const f: Features = new Map()
  for (const t of (s.topics ?? topicsForStory(s)).slice(0, MAX_TOPICS)) f.set(`t:${t}`, WEIGHT.topic)
  const host = hostOf(s.url)
  if (host) f.set(`d:${host}`, WEIGHT.site)
  if (s.source === 'rss' || s.source === 'status') f.set(`p:${s.sourceLabel}`, WEIGHT.publisher)
  if (s.source === 'lemmy') f.set(`c:${s.sourceLabel}`, WEIGHT.community)
  if ((s.source === 'bluesky' || s.source === 'mastodon') && s.author) f.set(`a:${s.author}`, WEIGHT.author)
  f.set(`s:${s.source}`, WEIGHT.source)
  const format = formatOf(s)
  f.set(`f:${format}`, format === 'article' ? WEIGHT.commonFormat : WEIGHT.format)
  for (const k of keywords(s.title)) if (!f.has(`k:${k}`)) f.set(`k:${k}`, WEIGHT.keyword)
  if (cache.size > 5000) cache.clear()
  cache.set(cacheKey, f)
  return f
}

const norm = (f: Features) => Math.sqrt([...f.values()].reduce((n, w) => n + w * w, 0)) || 1

/** How much a story resembles your taste: its features against your profile, scaled by its own size so a long title isn't favoured. */
export function similarity(f: Features, profile: Record<string, number>): number {
  let dot = 0
  for (const [k, w] of f) dot += (profile[k] ?? 0) * w
  return dot / norm(f)
}

/** Ranking multiplier from similarity: a story much like what you vote up roughly doubles, one like what you vote down drops to about a third. */
export function tasteFactor(f: Features, profile: Record<string, number>): number {
  const sim = Math.max(-3, Math.min(3, similarity(f, profile)))
  return Math.max(0.35, Math.min(2.5, Math.exp(0.45 * sim)))
}

/** The most a profile remembers; past this, its weakest tastes are forgotten. */
const PROFILE_CAP = 400
const LIMIT = 3

/**
 * Moves a profile towards (delta > 0) or away from (delta < 0) a story, by as much as the signal
 * is worth (store.ts LESSON: a vote 1.5, a save 0.75, a hide 0.6). Each feature moves by its share of the story, so one vote on a story
 * with a topic, a site and six keywords moves the topic most.
 */
/** How long a lesson takes to count for half as much: newer ones weigh more, and one hide doesn't exile a topic for good. */
const HALF_LIFE_DAYS = 45

/** A profile `days` on: every weight halved each HALF_LIFE_DAYS, and what's faded to almost nothing let go. */
export function fade(profile: Record<string, number>, days: number): Record<string, number> {
  if (!(days > 0)) return profile
  const k = 0.5 ** (days / HALF_LIFE_DAYS)
  const out: Record<string, number> = {}
  for (const [f, w] of Object.entries(profile)) {
    const v = Math.round(w * k * 100) / 100
    if (Math.abs(v) >= 0.05) out[f] = v
  }
  return out
}

export function learn(profile: Record<string, number>, f: Features, delta: number): Record<string, number> {
  const next = { ...profile }
  const n = norm(f)
  for (const [k, w] of f) {
    const v = Math.max(-LIMIT, Math.min(LIMIT, Math.round(((next[k] ?? 0) + (delta * w) / n) * 100) / 100))
    if (Math.abs(v) < 0.05) delete next[k]
    else next[k] = v
  }
  const entries = Object.entries(next)
  if (entries.length <= PROFILE_CAP) return next
  return Object.fromEntries(entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, PROFILE_CAP))
}

/** The features that most explain why a story ranks where it does, strongest first. */
export function reasons(f: Features, profile: Record<string, number>, n = 3): { key: string; pull: number }[] {
  return [...f]
    .map(([key, w]) => ({ key, pull: (profile[key] ?? 0) * w }))
    .filter((r) => Math.abs(r.pull) >= 0.1)
    .sort((a, b) => Math.abs(b.pull) - Math.abs(a.pull))
    .slice(0, n)
}

/**
 * The one reason worth putting on a row: only when your taste clearly moved the story (lifted by
 * 30% or more, or sunk by 25% or more), and only the strongest feature pulling that way.
 */
export function rowReason(f: Features, profile: Record<string, number>): { key: string; up: boolean } | undefined {
  if (!Object.keys(profile).length) return undefined
  const factor = tasteFactor(f, profile)
  const up = factor >= 1.3
  if (!up && factor > 0.75) return undefined
  const top = reasons(f, profile, 6).find((r) => (up ? r.pull > 0 : r.pull < 0))
  return top && { key: top.key, up }
}
