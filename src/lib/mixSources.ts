import { LEMMY_INSTANCES } from './lemmyKey.js'
import { isPrivateAddress } from './publishers.js'
import { TOPIC_BY_ID } from './topics.js'

// A mix is a channel you build: a name and a handful of sources (topics, publishers, Lemmy
// communities, Bluesky feeds, news searches). Published, it's a record in your own atproto repo,
// so anyone can follow it and it goes wherever your account goes. This file is the shape of that
// record and its checks, shared by the app and the server: a followed mix is someone else's data.

/** The record's lexicon: under PaperWing's own domain, paperwing.io, as atproto asks. */
export const MIX_NSID = 'io.paperwing.mix'
/** PaperWing's feed generator, which serves mixes published as Bluesky feeds. */
export const FEEDGEN_DID = 'did:web:paperwing.io'
/** A mix's Bluesky feed record has the mix's rkey, marked as ours. */
export const feedRkey = (mixRkey: string) => `pw-${mixRkey}`

export type MixSource =
  | { kind: 'topic'; id: string }
  | { kind: 'rss'; url: string; label: string }
  | { kind: 'standard'; url: string; label: string }
  | { kind: 'lemmy'; community: string; via?: string }
  | { kind: 'bskyFeed'; uri: string; name: string }
  | { kind: 'news'; q: string }

export interface MixRecord {
  name: string
  description?: string
  sources: MixSource[]
  createdAt: string
}

export const MAX_SOURCES = 24
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined)

/** One source, if it's well formed and points somewhere PaperWing will go. */
export function cleanSource(raw: unknown): MixSource | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const s = raw as Record<string, unknown>
  switch (s.kind) {
    case 'topic': {
      const id = str(s.id, 80)
      return id && TOPIC_BY_ID.has(id) ? { kind: 'topic', id } : undefined
    }
    case 'rss':
    case 'standard': {
      const url = str(s.url, 2000)
      if (!url || !/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(url)) return undefined
      try {
        const parsed = new URL(url)
        if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return undefined
        return { kind: s.kind, url, label: str(s.label, 120) ?? parsed.hostname }
      } catch {
        return undefined
      }
    }
    case 'lemmy': {
      const community = str(s.community, 200)
      const via = s.via === undefined ? undefined : str(s.via, 100)
      if (!community || !/^[a-z0-9_]+@[a-z0-9.-]+$/i.test(community) || (via !== undefined && !LEMMY_INSTANCES.has(via))) return undefined
      return { kind: 'lemmy', community, ...(via ? { via } : {}) }
    }
    case 'bskyFeed': {
      const uri = str(s.uri, 300)
      if (!uri || !/^at:\/\/did:[a-z0-9:._%-]+\/app\.bsky\.(feed\.generator|graph\.list)\/[A-Za-z0-9._~:-]+$/.test(uri)) return undefined
      return { kind: 'bskyFeed', uri, name: str(s.name, 120) ?? 'Bluesky feed' }
    }
    case 'news': {
      const q = str(s.q, 200)
      return q ? { kind: 'news', q } : undefined
    }
    default:
      return undefined
  }
}

/** A mix record as read from anyone's repo: only what checks out, nothing else. */
/** Whether a source can go in a published mix: not a feed whose address is a key to someone's account (publishers.ts). */
export const isPublicSource = (s: MixSource) => !((s.kind === 'rss' || s.kind === 'standard') && isPrivateAddress(s.url))

export function cleanMix(raw: unknown): MixRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const name = str(r.name, 100)
  if (!name || !Array.isArray(r.sources)) return undefined
  const seen = new Set<string>()
  const sources = r.sources
    .slice(0, MAX_SOURCES * 2)
    .map(cleanSource)
    // A private feed's address in an older record is never read, listed or fetched.
    .filter((s): s is MixSource => !!s && isPublicSource(s) && !seen.has(JSON.stringify(s)) && !!seen.add(JSON.stringify(s)))
    .slice(0, MAX_SOURCES)
  if (!sources.length) return undefined
  return { name, description: str(r.description, 600), sources, createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(0).toISOString() }
}

/** How a source reads in a list. */
export function sourceLabel(s: MixSource): string {
  switch (s.kind) {
    case 'topic':
      return TOPIC_BY_ID.get(s.id)?.label ?? s.id
    case 'rss':
    case 'standard':
      return s.label
    case 'lemmy':
      return `c/${s.community}`
    case 'bskyFeed':
      return s.name
    case 'news':
      return `News: ${s.q}`
  }
}

/** A mix's at:// URI, from its share link's parts. */
export const mixUri = (did: string, rkey: string) => `at://${did}/${MIX_NSID}/${rkey}`
export const AT_MIX = new RegExp(`^at://(did:(?:plc:[a-z2-7]{24}|web:[a-z0-9.%:-]+))/${MIX_NSID.replace(/\./g, '\\.')}/([a-z2-7]{13})$`)
