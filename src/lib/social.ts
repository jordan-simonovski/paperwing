import { TOPIC_BY_ID } from './topics.js'
import type { PublisherFeed } from './publishers.js'

// PaperWing's social records: small, public atproto records in each person's own Bluesky account, so
// they belong to the person, work in any client that cares to read them, and need no database here.
// Bluesky stays the place for reputation and scoring (likes, replies, follows); these only say what
// someone shared, read, noted or curates. Every record read from anyone's repo is checked here, by
// the app and the server alike.

export const SHARE_NSID = 'io.paperwing.share'
export const BLOGROLL_NSID = 'io.paperwing.blogroll'
export const NOTE_NSID = 'io.paperwing.note'
export const BOARD_NSID = 'io.paperwing.board'
export const BOARD_HIDE_NSID = 'io.paperwing.boardhide'

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max * 4 ? v.trim().slice(0, max) : undefined)
const web = (v: unknown) => (typeof v === 'string' && v.length <= 2000 && /^https?:\/\/\S+$/i.test(v) ? v : undefined)
const date = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : new Date(0).toISOString())
const DID = /^did:(?:plc:[a-z2-7]{24}|web:[a-z0-9.%:-]+)$/

/* ------------------------------------------------------------------ shares */

/** "Share with a note", Google Reader style: a link someone thinks is worth reading, and why. */
export interface Share {
  url: string
  title: string
  note?: string
  createdAt: string
}

export function cleanShare(raw: unknown): Share | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const url = web(r.url)
  const title = str(r.title, 300)
  if (!url || !title) return undefined
  return { url, title, note: str(r.note, 1000), createdAt: date(r.createdAt) }
}

/* ---------------------------------------------------------------- blogroll */

/** The blogs someone reads, published so others can find them through people. One per account (rkey "self"). */
export interface Blogroll {
  feeds: PublisherFeed[]
  updatedAt: string
}

export const MAX_BLOGROLL = 200

export function cleanBlogroll(raw: unknown): Blogroll | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.feeds)) return undefined
  const seen = new Set<string>()
  const feeds = r.feeds.slice(0, MAX_BLOGROLL * 2).flatMap((f): PublisherFeed[] => {
    if (!f || typeof f !== 'object') return []
    const o = f as Record<string, unknown>
    const url = web(o.url)
    const label = str(o.label, 120)
    if (!url || !label || seen.has(url)) return []
    seen.add(url)
    const site = typeof o.site === 'string' && /^[a-z0-9.-]{3,253}$/i.test(o.site) ? o.site : undefined
    const format = o.format === 'standard' || o.format === 'discourse' ? o.format : undefined
    return [{ url, label, ...(site ? { site } : {}), ...(format ? { format } : {}) }]
  })
  return feeds.length ? { feeds: feeds.slice(0, MAX_BLOGROLL), updatedAt: date(r.updatedAt) } : undefined
}

/* ------------------------------------------------------------ margin notes */

/** A public note on a passage of an article: the passage quoted, and what someone made of it. */
export interface MarginNote {
  url: string
  quote: string
  note: string
  createdAt: string
}

export function cleanNote(raw: unknown): MarginNote | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const url = web(r.url)
  const quote = str(r.quote, 600)
  const note = str(r.note, 1000)
  if (!url || !quote || !note) return undefined
  return { url, quote, note, createdAt: date(r.createdAt) }
}

/* ------------------------------------------------------------------ boards */

/**
 * A community board: a named space on PaperWing with its own description, rules and moderators,
 * owned by whoever made it. Stories are listed to it like to a topic board; its moderators can hide
 * a listing (a boardhide record) and its owner can point at a Bluesky moderation list whose members'
 * listings are left out. Votes and comments stay Bluesky likes and replies.
 */
export interface Board {
  name: string
  description?: string
  rules?: string
  /** A topic it's about, for discovery. */
  topic?: string
  moderators: string[]
  /** A Bluesky moderation list (app.bsky.graph.list) of accounts kept out. */
  blockList?: string
  /** Only its owner and moderators post (official boards always). Anyone can still vote and reply. */
  modsOnly?: boolean
  /** Takes words and links, not pictures: posts carrying pictures are left off it. */
  noImages?: boolean
  createdAt: string
}

export const MAX_MODERATORS = 12

/**
 * Whether a listing by `author` counts on a board owned by `owner`. Anyone can write a listing naming
 * any board, so where only moderators post (or the board is official), the rest are left out.
 */
export const canPost = (board: Pick<Board, 'moderators' | 'modsOnly'>, owner: string, author: string, official = false) =>
  !(board.modsOnly || official) || author === owner || board.moderators.includes(author)
const LIST_URI = /^at:\/\/did:[a-z0-9:._%-]+\/app\.bsky\.graph\.list\/[a-z0-9]{1,64}$/i

export function cleanBoard(raw: unknown): Board | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const name = str(r.name, 60)
  if (!name) return undefined
  const moderators = Array.isArray(r.moderators) ? [...new Set(r.moderators.filter((d): d is string => typeof d === 'string' && DID.test(d)))].slice(0, MAX_MODERATORS) : []
  const topic = typeof r.topic === 'string' && TOPIC_BY_ID.has(r.topic) ? r.topic : undefined
  const blockList = typeof r.blockList === 'string' && LIST_URI.test(r.blockList) ? r.blockList : undefined
  return {
    name,
    description: str(r.description, 600),
    rules: str(r.rules, 2000),
    topic,
    moderators,
    ...(blockList ? { blockList } : {}),
    ...(r.modsOnly === true ? { modsOnly: true } : {}),
    ...(r.noImages === true ? { noImages: true } : {}),
    createdAt: date(r.createdAt),
  }
}

/** What's written for a board: the board, plus PaperWing's address, so every board can be found (Constellation, by .site). */
export const boardRecord = (b: Omit<Board, 'createdAt'> & { createdAt?: string }) => ({
  name: b.name,
  ...(b.description ? { description: b.description } : {}),
  ...(b.rules ? { rules: b.rules } : {}),
  ...(b.topic ? { topic: b.topic } : {}),
  moderators: b.moderators,
  ...(b.blockList ? { blockList: b.blockList } : {}),
  ...(b.modsOnly ? { modsOnly: true } : {}),
  ...(b.noImages ? { noImages: true } : {}),
  site: 'https://paperwing.io',
  createdAt: b.createdAt ?? new Date().toISOString(),
})

/** A moderator hiding a listing from a board. */
export interface BoardHide {
  board: string
  subject: string
  reason?: string
  createdAt: string
}

const AT_POST = /^at:\/\/did:[a-z0-9:._%-]+\/app\.bsky\.feed\.post\/[a-z2-7]{13}$/
const AT_BOARD = /^at:\/\/did:[a-z0-9:._%-]+\/io\.paperwing\.board\/[a-z2-7]{13}$/

export function cleanBoardHide(raw: unknown): BoardHide | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.board !== 'string' || !AT_BOARD.test(r.board) || typeof r.subject !== 'string' || !AT_POST.test(r.subject)) return undefined
  return { board: r.board, subject: r.subject, reason: str(r.reason, 300), createdAt: date(r.createdAt) }
}
