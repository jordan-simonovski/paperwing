import { fetchBoard } from '../boards'
import { DEFAULT_INSTANCE } from '../mastodon'
import { fetchPerson } from '../people'
import type { FeedRef } from '../topics'
import type { SourceKind, Story } from '../types'
import { blueskyCustomFeed, blueskyFeed, blueskyFollowing } from './bluesky'
import { devtoTag } from './devto'
import { hnList, hnSearch } from './hn'
import { feed, type FeedSource } from './http'
import { lemmyFeed } from './lemmy'
import { mastodonHome, mastodonTags, mastodonTrends } from './mastodon'

// Every kind of feed PaperWing reads, in one table: how it's named, fetched, cached and drawn, and
// what its Latest looks like. Adding a source is one entry here (plus its fetcher, and an entry in
// api/feed.ts when the browser can't call it directly). The table's type maps over every FeedRef
// kind, so a kind without an entry doesn't compile.

type Ref<K extends FeedRef['kind']> = Extract<FeedRef, { kind: K }>

/** Whose feed it is, for feeds that differ per account: one person's Following is never another's. */
export interface FeedOwner {
  bluesky?: { did: string }
  mastodon?: { instance: string }
}

/** A feed's logo before any of its stories load: a source's mark (and the site, for a publisher), or one of PaperWing's own. */
export type FeedMark = { source: SourceKind; site?: string } | { own: 'paperwing' | 'status' }

interface FeedKind<K extends FeedRef['kind']> {
  /** The cache id: two refs with the same id are the same feed, for the same account. */
  id(ref: Ref<K>, owner: FeedOwner): string
  /** The feed's name in lists and errors. */
  label(ref: Ref<K>): string
  /** Who it's from as people know them: the network for social feeds, the publisher for a blog. */
  brand(ref: Ref<K>): string
  mark(ref: Ref<K>): FeedMark
  fetch(ref: Ref<K>): Promise<Story[]>
  /** The same source newest first, for Latest. Without it, Latest re-sorts the usual feed. */
  newest?(ref: Ref<K>): Ref<K>
}

/** A source the browser can't call directly: fetched through api/feed.ts, which names it the same way. */
const viaServer = (src: FeedSource, params: Record<string, string | number | undefined> = {}) => feed(src, params) as Promise<Story[]>
const join = (list: string[] | undefined) => (list?.length ? list.join(',') : undefined)
const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').replace(/^(feeds?|rss|blog)\./, '')
  } catch {
    return undefined
  }
}

export const FEED_KINDS: { [K in FeedRef['kind']]: FeedKind<K> } = {
  hn: {
    id: (r) => `hn:${r.list}`,
    label: (r) => (r.list === 'top' ? 'Hacker News' : `HN ${r.list}`),
    brand: () => 'Hacker News',
    mark: () => ({ source: 'hn' }),
    fetch: (r) => hnList(r.list),
    newest: (r) => (r.list === 'top' || r.list === 'best' ? { ...r, list: 'new' } : r),
  },
  hnSearch: {
    id: (r) => `hns:${r.query}`,
    label: () => 'HN search',
    brand: () => 'Hacker News',
    mark: () => ({ source: 'hn' }),
    fetch: (r) => hnSearch(r.query, { anyWord: r.anyWord, days: r.anyWord ? 7 : 30, minPoints: r.anyWord ? 5 : 2, limit: 100 }),
  },
  lobsters: {
    id: (r) => `lb:${r.path}`,
    label: (r) =>
      r.path.startsWith('t/')
        ? `Lobsters ${r.path
            .slice(2)
            .split(',')
            .map((t) => `#${t}`)
            .join(' ')}`
        : 'Lobsters',
    brand: () => 'Lobsters',
    mark: () => ({ source: 'lobsters' }),
    fetch: (r) => viaServer('lobsters', { path: r.path }),
    newest: (r) => (r.path === 'hottest' || r.path === 'active' ? { ...r, path: 'newest' } : r),
  },
  devto: {
    id: (r) => `dv:${r.tag}`,
    label: (r) => `dev.to #${r.tag}`,
    brand: () => 'dev.to',
    mark: () => ({ source: 'devto' }),
    fetch: (r) => devtoTag(r.tag),
  },
  rss: {
    id: (r) => `rss:${r.url}`,
    label: (r) => r.label,
    brand: (r) => r.label,
    mark: (r) => ({ source: 'rss', site: siteOf(r.url) }),
    fetch: (r) => viaServer('rss', { url: r.url, label: r.label }),
  },
  arxiv: {
    id: (r) => `ax:${r.q}`,
    label: () => 'arXiv',
    brand: () => 'arXiv',
    mark: () => ({ source: 'arxiv' }),
    fetch: (r) => viaServer('arxiv', { q: r.q }),
  },
  hf: {
    id: () => 'hf',
    label: () => 'HF Papers',
    brand: () => 'Hugging Face',
    mark: () => ({ source: 'hf' }),
    fetch: () => viaServer('hf'),
  },
  github: {
    id: (r) => `gh:${r.q}`,
    label: () => 'GitHub',
    brand: () => 'GitHub',
    mark: () => ({ source: 'github' }),
    fetch: (r) => viaServer('github', { q: r.q }),
  },
  releases: {
    id: (r) => `rel:${r.repos.join(',')}`,
    label: (r) => `Releases (${r.repos.length} projects)`,
    brand: () => 'GitHub',
    mark: () => ({ source: 'release' }),
    fetch: (r) => viaServer('releases', { repos: r.repos.join(',') }),
  },
  bluesky: {
    id: (r, owner) => (r.feed === 'following' ? `bs:following:${owner.bluesky?.did ?? ''}` : `bs:${r.feed}`),
    label: (r) => (r.feed === 'tech' ? 'Bluesky' : r.feed === 'following' ? 'Bluesky following' : `Bluesky ${r.feed}`),
    brand: () => 'Bluesky',
    mark: () => ({ source: 'bluesky' }),
    fetch: (r) => (r.feed === 'following' ? blueskyFollowing() : blueskyFeed(r.feed)),
  },
  bskyFeed: {
    id: (r) => `bsf:${r.uri}`,
    label: (r) => r.name,
    brand: () => 'Bluesky',
    mark: () => ({ source: 'bluesky' }),
    fetch: (r) => blueskyCustomFeed(r.uri),
  },
  frontpage: {
    id: (r) => `fp:${r.feed}`,
    label: (r) => (r.feed === 'hot' ? 'Frontpage' : `Frontpage ${r.feed}`),
    brand: () => 'Frontpage',
    mark: () => ({ source: 'frontpage', site: 'frontpage.fyi' }),
    fetch: (r) => viaServer('frontpage', { feed: r.feed }),
    newest: (r) => ({ ...r, feed: 'new' }),
  },
  lemmy: {
    id: (r) => `lm:${r.community}:${r.sort ?? 'Hot'}${r.via ? `@${r.via}` : ''}`,
    label: (r) => `Lemmy c/${r.community.split('@')[0]}`,
    brand: () => 'Lemmy',
    mark: () => ({ source: 'lemmy' }),
    fetch: (r) => lemmyFeed(r.community, r.sort, r.via),
    newest: (r) => ({ ...r, sort: 'New' }),
  },
  mastodon: {
    id: (r, owner) => `md:${owner.mastodon?.instance ?? DEFAULT_INSTANCE}:${r.feed}:${r.tags?.join(',') ?? ''}`,
    label: (r) => (r.feed === 'tags' ? `Mastodon ${(r.tags ?? []).map((t) => `#${t}`).join(' ')}` : r.feed === 'home' ? 'Mastodon following' : 'Mastodon trending'),
    brand: () => 'Mastodon',
    mark: () => ({ source: 'mastodon' }),
    fetch: (r) => (r.feed === 'tags' ? mastodonTags(r.tags ?? []) : r.feed === 'home' ? mastodonHome() : mastodonTrends()),
  },
  news: {
    id: (r) => `nw:${r.q}`,
    label: (r) => `News: ${r.q}`,
    brand: () => 'News',
    mark: () => ({ source: 'rss' }),
    fetch: (r) => viaServer('news', { q: r.q }),
  },
  paperwing: {
    id: (r) => `pw:${r.sort}:${r.board ?? ''}`,
    label: (r) => (r.board ? 'PaperWing board' : 'PaperWing'),
    brand: () => 'PaperWing',
    mark: () => ({ own: 'paperwing' }),
    fetch: (r) => viaServer('paperwing', { sort: r.sort, board: r.board }),
    newest: (r) => ({ ...r, sort: 'new' }),
  },
  person: {
    id: (r) => `pp:${r.actor}`,
    label: (r) => r.label ?? `@${r.actor}`,
    brand: (r) => r.label ?? `@${r.actor}`,
    mark: () => ({ own: 'paperwing' }),
    fetch: async (r) => {
      const p = await fetchPerson(r.actor)
      return [...p.stories, ...(p.shares ?? [])]
    },
  },
  board: {
    id: (r) => `cb:${r.did}:${r.rkey}:${r.sort}`,
    label: (r) => r.name ?? 'Community board',
    brand: (r) => r.name ?? 'Community board',
    mark: () => ({ own: 'paperwing' }),
    fetch: async (r) => (await fetchBoard(r.did, r.rkey, r.sort)).stories,
  },
  status: {
    id: (r) => `st:${r.providers?.join(',') ?? 'all'}:${r.active ? 'active' : 'week'}:${r.hosts?.join(',') ?? ''}`,
    label: (r) => (r.active ? 'Status pages, ongoing' : 'Status pages'),
    brand: () => 'Status pages',
    mark: () => ({ own: 'status' }),
    fetch: (r) => viaServer('status', { providers: join(r.providers), active: r.active ? '1' : undefined, hosts: join(r.hosts) }),
  },
}

// The table is typed per kind, so each entry only ever sees its own refs; these read it for any ref.
interface AnyKind {
  id(ref: FeedRef, owner: FeedOwner): string
  label(ref: FeedRef): string
  brand(ref: FeedRef): string
  mark(ref: FeedRef): FeedMark
  fetch(ref: FeedRef): Promise<Story[]>
  newest?(ref: FeedRef): FeedRef
}
const kindOf = (ref: FeedRef) => FEED_KINDS[ref.kind] as unknown as AnyKind

export const feedId = (ref: FeedRef, owner: FeedOwner = {}) => kindOf(ref).id(ref, owner)
export const feedLabel = (ref: FeedRef) => kindOf(ref).label(ref)
export const feedBrand = (ref: FeedRef) => kindOf(ref).brand(ref)
export const feedMark = (ref: FeedRef): FeedMark => kindOf(ref).mark(ref)
export const fetchFeed = (ref: FeedRef): Promise<Story[]> => kindOf(ref).fetch(ref)
/** The same source newest first, for Latest: a true timeline that doesn't miss what hasn't caught on yet. */
export const newestOf = (ref: FeedRef): FeedRef => kindOf(ref).newest?.(ref) ?? ref
