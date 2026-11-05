import { plainText } from './plainText'
import type { DiscussionSummary, SummaryComment, SummaryRequest } from './summaryTypes'
import type { Comment, Story, Thread } from './types'
import { getJson, remembered } from './remembered'

// Turns the threads around a story into one compact transcript for /api/summarize, with a short
// ref per comment so the summary can point back at them.

const LETTER: Record<string, string> = { hn: 'h', lobsters: 'l', bluesky: 'b', devto: 'd', lemmy: 'y', mastodon: 'm', frontpage: 'f' }
const NAME: Record<string, string> = { hn: 'Hacker News', lobsters: 'Lobsters', bluesky: 'Bluesky', devto: 'dev.to', lemmy: 'Lemmy', mastodon: 'Mastodon', frontpage: 'Frontpage' }
const PER_COMMENT = 900
const BUDGET = 110_000
const MAX_DEPTH = 4

export interface CommentRef {
  threadKey: string
  commentId: string
  author: string
}

const countAll = (cs: Comment[]): number => cs.reduce((n, c) => n + 1 + countAll(c.children), 0)

export function buildSummaryRequest(story: Story, threads: { story: Story; thread: Thread }[]): { request: SummaryRequest; refs: Map<string, CommentRef> } {
  const refs = new Map<string, CommentRef>()
  // Busier threads get more room, but every thread gets some.
  const totals = threads.map((t) => countAll(t.thread.comments))
  const all = totals.reduce((a, b) => a + b, 0) || 1
  const request: SummaryRequest = { title: story.title, url: story.url, threads: [] }
  threads.forEach(({ story: s, thread }, ti) => {
    const letter = LETTER[s.source] ?? 'x'
    let budget = Math.max(12_000, (BUDGET * totals[ti]) / all)
    let n = 0
    const comments: SummaryComment[] = []
    // Thread order is already best-first; walk it depth-first so replies stay under their parent.
    const walk = (cs: Comment[], depth: number) => {
      for (const c of cs) {
        if (budget <= 0) return
        // Block ends become spaces, so paragraphs and links don't run together.
        const text = plainText(c.html.replace(/<\/(p|li|pre|blockquote|div)>|<br\s*\/?>/gi, '$& ')).trim()
        if (text && !c.deleted) {
          const ref = `${letter}${ti + 1}.${++n}`
          const clipped = text.length > PER_COMMENT ? `${text.slice(0, PER_COMMENT)}…` : text
          comments.push({ ref, author: c.author, score: c.score, depth, text: clipped })
          refs.set(ref, { threadKey: s.key, commentId: c.id, author: c.author })
          budget -= clipped.length + c.author.length + 12
        }
        if (depth < MAX_DEPTH) walk(c.children, depth + 1)
      }
    }
    walk(thread.comments, 0)
    request.threads.push({ source: NAME[s.source] ?? s.source, title: s.title, comments, total: totals[ti] })
  })
  return { request, refs }
}

const KEY = 'readout:anthropic-key'

/** A reader's own Anthropic key. Kept in this browser only: never synced, sent only with summary requests. */
export const ownKey = {
  get: () => {
    try {
      return localStorage.getItem(KEY) ?? undefined
    } catch {
      return undefined
    }
  },
  set: (key?: string) => {
    try {
      if (key) localStorage.setItem(KEY, key)
      else localStorage.removeItem(KEY)
    } catch {
      /* storage blocked */
    }
  },
}

export const summaryStatus = remembered(() => getJson<{ server: boolean; model?: string }>('/api/summarize?status'), { server: false } as { server: boolean; model?: string })

export async function requestSummary(request: SummaryRequest): Promise<{ summary: DiscussionSummary; model: string }> {
  const key = ownKey.get()
  const res = await fetch('/api/summarize', { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-anthropic-key': key } : {}) }, body: JSON.stringify(request) })
  const data = (await res.json().catch(() => ({}))) as { summary?: DiscussionSummary; model?: string; error?: string }
  if (!res.ok || !data.summary) throw new Error(data.error ?? `Summary failed (${res.status})`)
  return { summary: data.summary, model: data.model ?? '' }
}
