// What /api/feed?src=hiring answers: one employer's openings, from its own job board.

export interface Opening {
  title: string
  url: string
  location: string
  /** Engineering, Sales… */
  function: string
  /** ISO date the board says it was posted, when it says. */
  postedAt?: string
}

export interface Hiring {
  employer: string
  /** The employer's own job board, where every opening is. */
  board: string
  open: number
  /** Openings posted in the last two weeks; null when the board's dates can't be trusted (it re-posts in bulk). */
  fresh: number | null
  /** Openings by function, biggest first. */
  functions: [name: string, count: number][]
  /** The newest few. */
  latest: Opening[]
}
