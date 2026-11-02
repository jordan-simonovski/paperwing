// The shape of a discussion summary, shared by /api/summarize and the reader. Comment references
// are the short ids the request assigned ("h3", "b12"), which the client maps back to comments.

export interface SummaryComment {
  /** Short id the model cites. */
  ref: string
  author: string
  score?: number
  depth: number
  text: string
}

export interface SummaryThread {
  source: string
  title: string
  comments: SummaryComment[]
  /** How many comments the thread has in all, when more than were sent. */
  total: number
}

export interface SummaryRequest {
  title: string
  url?: string | null
  threads: SummaryThread[]
}

export interface DiscussionSummary {
  gist: string
  themes: { title: string; summary: string; comments: string[] }[]
  disagreements: { question: string; sides: { view: string; comments: string[] }[] }[]
  standouts: { comment: string; why: string }[]
  /** How the reaction differs between places, when there is more than one. */
  contrast: string | null
}
