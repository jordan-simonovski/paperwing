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
  /** The tone of the replies, 0 (friendly) to 3 (personal attacks), and how sure Jev was. */
  heat: number
  confidence: number
  /** How likely the replies are sharp or worse (tone 2 or 3), and personal attacks (tone 3). */
  sharp: number
  flame: number
  /** How likely people are divided into sides (0 to 1). */
  split: number
  /** The share of replies that push back on the comment they answer (0 to 1). */
  pushback: number
  /** How many different people insult, mock or belittle someone they reply to. */
  hostile: number
  /** What else the discussion is like; missing on grades from before it was asked, and on quiet ones. */
  insights?: SpiceInsights
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

/** A comment to jump to: its id at the source, as the reader's thread has it. */
export interface SpiceRef {
  id: string
  author: string
}

export interface SpiceInsights {
  /** How likely (0 to 1) commenters grieve, are delighted, are warm to each other, argue politics. */
  sad: number
  delighted: number
  warm: number
  political: number
  /** Top-level comments saying the title or main claim is wrong: set only when two or more people do. */
  disputed: SpiceRef[]
  /** Answers to what the post asks readers: set only when it asks something. */
  answers: SpiceRef[]
}
