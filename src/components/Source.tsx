import type { SourceKind, Story } from '../lib/types'

export const SOURCE_NAMES: Record<SourceKind, string> = {
  hn: 'Hacker News',
  lobsters: 'Lobsters',
  devto: 'dev.to',
  hf: 'HF Papers',
  arxiv: 'arXiv',
  github: 'GitHub',
  release: 'Releases',
  rss: 'Blogs',
  bluesky: 'Bluesky',
  lemmy: 'Lemmy',
  mastodon: 'Mastodon',
  status: 'Status pages',
  frontpage: 'Frontpage',
}

/** The name a row shows: the blog or feed when there is one, otherwise the source. */
export function sourceLabel(s: Pick<Story, 'source' | 'sourceLabel'>): string {
  if (s.source === 'hn') return 'Hacker News'
  if (s.source === 'devto') return 'dev.to'
  return s.sourceLabel
}

const UNITS: Partial<Record<SourceKind, [string, string]>> = {
  github: ['star', 'stars'],
  devto: ['reaction', 'reactions'],
  hf: ['upvote', 'upvotes'],
  bluesky: ['like', 'likes'],
  mastodon: ['reaction', 'reactions'],
  frontpage: ['vote', 'votes'],
}

export function scoreUnit(source: SourceKind, n: number): string {
  const [one, many] = UNITS[source] ?? ['point', 'points']
  return n === 1 ? one : many
}
