// How heated a story's discussion is, graded on the server by TypeSafe's Jev (api/spice.ts) and
// shown as chillies on rows and in the reader.

export type SpiceLevel = 0 | 1 | 2 | 3

/**
 * The sources graded, by key prefix, and how many comments a thread needs first. Lobsters and
 * Lemmy threads run smaller than HN's and argue just as hard, so they need fewer.
 */
export const SPICE_MIN: Record<string, number> = { hn: 25, bs: 25, lb: 12, lm: 15, dv: 20 }
export const spiceMin = (key: string): number | undefined => SPICE_MIN[key.slice(0, 2)]

export interface SpiceGrade {
  level: SpiceLevel
  /** Jev's heat score, 0 (calm) to 3 (flamewar), and how sure it was. */
  heat: number
  confidence: number
  /** Probabilities (0 to 1) of what makes it heated. */
  split: number
  pushback: number
  hostile: number
  pileOn: number
  /** Comments in the thread when it was graded. */
  comments: number
  at: number
  /** Which set of questions produced it (api/_lib/spice.ts). */
  v?: number
}

export interface SpiceResponse {
  enabled: boolean
  grades: Record<string, SpiceGrade>
  /** Keys being graded now: worth asking about again in a little while. */
  pending: string[]
}
