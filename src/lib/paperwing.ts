import { TOPIC_BY_ID } from './topics.js'

// Posting to PaperWing. A submission is a normal Bluesky post, plus this record in the poster's
// own repo saying "this post is a PaperWing submission, on this board". Both addresses in it
// (the site and the board's page) are what Constellation indexes, so the front page and each board
// can be listed from the open network (api/_lib/paperwing.ts). Shared by the app and the server.

export const SUBMISSION_NSID = 'io.paperwing.submission'
export const PAPERWING_SITE = 'https://paperwing.io'
export const boardUrl = (board: string) => `${PAPERWING_SITE}/b/${encodeURIComponent(board)}`

export type PaperwingSort = 'hot' | 'new' | 'top'

export interface Submission {
  /** The Bluesky post: votes are its likes, comments its replies. */
  post: { uri: string; cid: string }
  url: string
  title: string
  /** A topic id: the board it's on. */
  board?: string
  site: typeof PAPERWING_SITE
  boardUrl?: string
  createdAt: string
}

const POST = /^at:\/\/did:[a-z0-9:._%-]+\/app\.bsky\.feed\.post\/[a-z2-7]{13}$/

/** A submission record as read from anyone's repo: only what checks out. */
export function cleanSubmission(raw: unknown): Submission | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const post = r.post as Record<string, unknown> | undefined
  if (!post || typeof post.uri !== 'string' || typeof post.cid !== 'string' || !POST.test(post.uri)) return undefined
  if (typeof r.url !== 'string' || !/^https?:\/\/\S+$/.test(r.url) || r.url.length > 2000) return undefined
  if (typeof r.title !== 'string' || !r.title.trim()) return undefined
  const board = typeof r.board === 'string' && TOPIC_BY_ID.has(r.board) ? r.board : undefined
  return {
    post: { uri: post.uri, cid: post.cid },
    url: r.url,
    title: r.title.trim().slice(0, 300),
    board,
    site: PAPERWING_SITE,
    boardUrl: board ? boardUrl(board) : undefined,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(0).toISOString(),
  }
}

/** The record written alongside a Bluesky post to submit it. */
export const submissionRecord = (post: { uri: string; cid: string }, url: string, title: string, board?: string): Omit<Submission, 'site'> & { site: string } => ({
  // Just the reference: a createRecord response also carries its commit and validation status.
  post: { uri: post.uri, cid: post.cid },
  url,
  title,
  ...(board ? { board, boardUrl: boardUrl(board) } : {}),
  site: PAPERWING_SITE,
  createdAt: new Date().toISOString(),
})
