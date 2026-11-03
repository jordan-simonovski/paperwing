import { keyId, parseStoryKey } from '../../src/lib/storyKey.js'
import type { Comment } from '../../src/lib/types.js'
import { spiceMin, type SpiceGrade, type SpiceInsights, type SpiceLevel, type SpiceRef } from '../../src/lib/spiceTypes.js'
import { parseLemmyKey } from '../../src/lib/lemmyKey.js'
import { fetchJson, stripHtml } from './http.js'
import { lobstersThread } from './sources.js'

// Spice: how heated a discussion is, which is not the same as how negative it is. A thread that
// agrees a company got it wrong is negative but calm; two camps arguing is spicy. Jev (TypeSafe's
// classifier) rates the tone of the replies and whether people split into sides, and judges each
// reply on its own: does it push back, is it hostile. How many push back, how many people are
// hostile, and the level and its label are worked out here in code, as TypeSafe recommends.
//
// The server fetches each thread itself from fixed hosts, so a grade only ever reflects the real
// discussion: nobody can get a grade stored by sending made-up comments.

const MAX_COMMENTS = 80
const PER_COMMENT = 450
const MAX_CHARS = 26_000
const MAX_DEPTH = 5
/** Top-level threads that each get a share of the comments before any gets more. */
const MAX_TOPS = 16
/** The post's own words, enough to know what it asks readers. */
const STORY_TEXT = 1500

export interface SpiceComment {
  /** The comment's id at its source, as the reader's thread has it: what a jump to it needs. */
  id: string
  author: string
  text: string
  children: SpiceComment[]
}

/** The sources graded: discussions fetched from fixed public hosts (Lemmy through the instances the client reads it from). */
export function validKey(key: string): boolean {
  if (/^(hn|dv)-\d{1,12}$/.test(key) || /^lb-[a-z0-9]{1,12}$/.test(key)) return true
  if (key.startsWith('lm-')) return /^lm-\d{1,12}(@|$)/.test(key) && !!parseLemmyKey(key)
  if (!/^bs-[A-Za-z0-9_-]{10,300}$/.test(key)) return false
  return /^at:\/\/did:[a-z0-9:._-]+\/app\.bsky\.feed\.post\/[a-z0-9]+$/i.test(blueskyUri(key))
}

const blueskyUri = (key: string) => {
  const p = parseStoryKey(key)
  return p?.kind === 'bs' ? p.uri : ''
}

const count = (cs: SpiceComment[]): number => cs.reduce((n, c) => n + 1 + count(c.children), 0)

interface AlgoliaItem {
  id: number
  type: string
  author: string | null
  text: string | null
  children: AlgoliaItem[]
}
interface LemmyComment {
  comment: { id: number; content: string; path: string; removed: boolean; deleted: boolean }
  creator: { name: string }
}
interface DevtoComment {
  id_code?: string
  body_html?: string
  user?: { username: string }
  children?: DevtoComment[]
}

/** Lemmy returns comments flat, each with its ancestry in `path` ("0.12.34"); rebuilt into a tree. */
export function lemmyTree(views: LemmyComment[]): SpiceComment[] {
  const byId = new Map<string, SpiceComment>()
  for (const v of views) byId.set(String(v.comment.id), { id: String(v.comment.id), author: v.creator.name, text: v.comment.removed || v.comment.deleted ? '' : v.comment.content, children: [] })
  const roots: SpiceComment[] = []
  for (const v of views) {
    const ids = v.comment.path.split('.')
    const node = byId.get(ids[ids.length - 1])!
    if (ids.length <= 2) roots.push(node)
    else byId.get(ids[ids.length - 2])?.children.push(node)
  }
  return roots
}

interface BskyNode {
  post?: { uri: string; author: { handle: string }; record: { text?: string }; likeCount?: number }
  replies?: BskyNode[]
}

export interface Discussion {
  title: string
  /** The post's own words, where it has some (Ask HN, a Lemmy or Bluesky post): what it asks readers. */
  text: string
  comments: SpiceComment[]
}

/** A thread's title, its own text and its comment tree, best-first where the source ranks them. */
export async function fetchDiscussion(key: string): Promise<Discussion> {
  const hn = keyId(key, 'hn')
  if (hn) {
    const id = hn
    const [item, ranked] = await Promise.all([
      fetchJson<AlgoliaItem & { title?: string }>(`https://hn.algolia.com/api/v1/items/${id}`),
      fetchJson<{ kids?: number[] } | null>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).catch(() => null),
    ])
    const order = new Map((ranked?.kids ?? []).map((k, i) => [k, i]))
    const map = (c: AlgoliaItem): SpiceComment => ({
      id: String(c.id),
      author: c.author ?? '',
      text: c.text ? stripHtml(c.text) : '',
      children: c.children.filter((x) => x.type === 'comment').map(map),
    })
    const top = item.children.filter((c) => c.type === 'comment').sort((a, b) => (order.get(a.id) ?? 1e6) - (order.get(b.id) ?? 1e6))
    return { title: item.title ?? '', text: item.text ? stripHtml(item.text) : '', comments: top.map(map) }
  }
  if (key.startsWith('lm-')) {
    const lm = parseLemmyKey(key)
    if (!lm) throw new Error('Not a Lemmy post')
    const [{ post_view }, { comments }] = await Promise.all([
      fetchJson<{ post_view: { post: { name: string; body?: string } } }>(`https://${lm.via}/api/v3/post?id=${lm.id}`),
      fetchJson<{ comments: LemmyComment[] }>(`https://${lm.via}/api/v3/comment/list?post_id=${lm.id}&max_depth=8&sort=Top&type_=All`),
    ])
    return { title: post_view.post.name, text: post_view.post.body ?? '', comments: lemmyTree(comments) }
  }
  const dv = keyId(key, 'dv')
  if (dv) {
    const id = dv
    const [article, comments] = await Promise.all([fetchJson<{ title: string }>(`https://dev.to/api/articles/${id}`), fetchJson<DevtoComment[]>(`https://dev.to/api/comments?a_id=${id}`)])
    const map = (c: DevtoComment): SpiceComment => ({ id: c.id_code ?? '', author: c.user?.username ?? '', text: stripHtml(c.body_html ?? ''), children: (c.children ?? []).map(map) })
    return { title: article.title, text: '', comments: comments.map(map) }
  }
  const lb = keyId(key, 'lb')
  if (lb) {
    const thread = await lobstersThread(lb)
    const map = (c: Comment): SpiceComment => ({ id: c.id, author: c.author, text: c.deleted ? '' : stripHtml(c.html), children: c.children.map(map) })
    return { title: thread.story.title, text: thread.story.text ? stripHtml(thread.story.text) : '', comments: thread.comments.map(map) }
  }
  const { thread } = await fetchJson<{ thread: BskyNode }>(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(blueskyUri(key))}&depth=8&parentHeight=0`)
  const map = (n: BskyNode): SpiceComment => ({
    id: n.post?.uri ?? '',
    author: n.post?.author.handle ?? '',
    text: n.post?.record.text ?? '',
    children: (n.replies ?? [])
      .filter((r) => r.post)
      .sort((a, b) => (b.post!.likeCount ?? 0) - (a.post!.likeCount ?? 0))
      .map(map),
  })
  const text = thread.post?.record.text ?? ''
  return { title: text.split('\n')[0].slice(0, 200), text, comments: map(thread).children }
}

export interface SpiceState {
  /** The post: its title, and its own words when it has some (clipped). */
  story: { title: string; text?: string }
  /** Each comment numbered in reading order; `reply_to` is the number of the comment it answers. */
  comments: { id: number; reply_to: number | null; author: string; text: string }[]
}

const clip = (c: SpiceComment) => {
  const text = c.text.replace(/\s+/g, ' ').trim()
  return text.length > PER_COMMENT ? `${text.slice(0, PER_COMMENT)}…` : text
}

export interface Built {
  state: SpiceState
  /** Comments in the whole thread. */
  total: number
  /** The source id of each numbered comment (`sources[id - 1]`), kept out of what Jev reads. */
  sources: string[]
}

/**
 * The top of the discussion, trimmed: Jev is most accurate with only what the question needs.
 * The first top-level threads each get an equal share first, so one long argument under the top
 * comment can't fill every slot and stand for the whole discussion; any room left goes to the
 * rest in reading order.
 */
export function buildState(title: string, tree: SpiceComment[], text = ''): Built {
  const keep = new Set<SpiceComment>()
  let chars = 0
  const take = (c: SpiceComment, depth: number, cap: number, charCap: number) => {
    if (keep.size >= cap || chars >= charCap) return
    const text = clip(c)
    if (text && !keep.has(c)) {
      keep.add(c)
      chars += text.length + c.author.length + 24
    }
    if (depth < MAX_DEPTH) for (const r of c.children) take(r, depth + 1, cap, charCap)
  }
  const tops = tree.slice(0, MAX_TOPS)
  // A share of the slots and of the words: long comments mustn't spend the words before the last conversations.
  const share = Math.floor(MAX_COMMENTS / Math.max(1, tops.length))
  const words = Math.floor(MAX_CHARS / Math.max(1, tops.length))
  for (const top of tops) take(top, 0, keep.size + share, chars + words)
  for (const top of tree) take(top, 0, MAX_COMMENTS, MAX_CHARS)

  // Numbered in reading order, whichever pass picked them.
  const comments: SpiceState['comments'] = []
  const sources: string[] = []
  const emit = (cs: SpiceComment[], parent: number | null, depth: number) => {
    for (const c of cs) {
      let id = parent
      if (keep.has(c)) {
        id = comments.length + 1
        comments.push({ id, reply_to: parent, author: c.author, text: clip(c) })
        sources.push(c.id)
      }
      if (depth < MAX_DEPTH) emit(c.children, id, depth + 1)
    }
  }
  emit(tree, null, 0)
  const own = text.replace(/\s+/g, ' ').trim().slice(0, STORY_TEXT)
  return { state: { story: { title, ...(own ? { text: own } : {}) }, comments }, total: count(tree), sources }
}

// Wording probed against Jev 1.14 on real HN, Lobsters and Lemmy threads before it shipped.

/** Questions about the whole thread, asked over it as state. */
export const THREAD_QUESTIONS = {
  // How people argue, not how many do: the replies below measure how many push back.
  tone: {
    type: 'score',
    instructions: 'What tone do the replies in `comments` take toward the comments they answer?',
    criteria: [
      'Replies are friendly or neutral: people agree, add information or ask questions',
      'Replies disagree politely and give their reasons',
      'Replies are sharp, dismissive or sarcastic',
      'Replies insult the person they answer and attack them personally',
    ],
  },
  split: { type: 'noul', instructions: 'The commenters in `comments` are divided into opposing sides about the story in `story`.' },
  // What the discussion is like, beyond heat. Several can be true at once, so each is its own question.
  sad: {
    type: 'noul',
    instructions: 'Commenters in `comments` express grief, sorrow or sympathy about what `story` describes.',
    criteria: {
      true: 'People mourn, say they are sad, or offer sympathy, as over a death, an illness or a loss',
      false: 'People discuss it with interest, excitement, anger or argument, and nobody is mourning',
    },
  },
  delighted: {
    type: 'noul',
    instructions: 'Commenters in `comments` are delighted by what `story` describes.',
    criteria: { true: 'People say they love it, are excited by it, or that it made them happy', false: 'People are neutral, critical, worried or sad about it' },
  },
  warm: {
    type: 'noul',
    instructions: 'Commenters in `comments` are warm and kind to each other.',
    criteria: { true: 'People thank and encourage each other, share fond memories, and welcome each other’s stories', false: 'People are neutral, businesslike or argumentative with each other' },
  },
  political: {
    type: 'noul',
    instructions: 'Commenters in `comments` argue about politics.',
    criteria: {
      true: 'People take sides on governments, parties, politicians, elections or political causes',
      false: 'People discuss technology, business, culture or personal experience without taking political sides',
    },
  },
} as const

/**
 * Questions about each top-level comment, and whether the post asks readers something (asked
 * either way: code reads the answers only when it does).
 */
export function topQuestions(state: SpiceState): Record<string, unknown> {
  const questions: Record<string, unknown> = { asks_help: { type: 'noul', instructions: 'The post in `story` asks readers for help, advice or recommendations.' } }
  for (const c of state.comments) {
    if (c.reply_to !== null) continue
    const comment = { author: c.author, text: c.text }
    questions[`disputes_${c.id}`] = {
      type: 'noul',
      instructions: { question: 'Does the comment say the title or the main claim of `story` is wrong or misleading?', comment },
      criteria: {
        true: 'The comment says the story gets a fact wrong, overstates it, or its title misrepresents it',
        false: 'The comment accepts what the story says, and only discusses, adds to, or argues about it',
      },
    }
    questions[`answers_${c.id}`] = { type: 'noul', instructions: { question: 'Does the comment answer what `story` asks readers?', comment } }
  }
  return questions
}

/**
 * Two questions per reply, with the comment it answers written into the question: Jev judges a
 * pair it can see better than it follows `reply_to` through a list, and code does the counting.
 */
export function replyQuestions(state: SpiceState): Record<string, unknown> {
  const byId = new Map(state.comments.map((c) => [c.id, c]))
  const questions: Record<string, unknown> = {}
  for (const c of state.comments) {
    const parent = c.reply_to === null ? undefined : byId.get(c.reply_to)
    if (!parent) continue
    const pair = { comment: { author: parent.author, text: parent.text }, reply: { author: c.author, text: c.text } }
    questions[`push_${c.id}`] = {
      type: 'noul',
      instructions: { question: 'Does the reply push back on the comment it answers?', ...pair },
      // Without this, a counter-argument that never says "I disagree" read as agreement.
      criteria: {
        true: 'The reply argues against the comment, corrects it, doubts it, or dismisses its point, even without saying "I disagree"',
        false: 'The reply agrees with the comment, adds to it, asks about it, or jokes along with it',
      },
    }
    questions[`hostile_${c.id}`] = { type: 'noul', instructions: { question: 'Does the reply insult, mock or belittle the person who wrote the comment?', ...pair } }
  }
  return questions
}

interface Noul {
  noul: number
}
export interface JevAnswers {
  tone: { score: number; confidence: number; probabilities: Record<string, number> }
  split: Noul
  sad: Noul
  delighted: Noul
  warm: Noul
  political: Noul
  /** `push_<id>` and `hostile_<id>` for each reply, `disputes_<id>` and `answers_<id>` for each top-level comment, and `asks_help`. */
  items: Record<string, Noul>
}

/** A yes from Jev: a reply that's hostile, a comment that disputes the story or answers it. */
const YES = 0.7
/** Comments named for a jump, at most. */
const MAX_REFS = 3

/**
 * The chillies, from what Jev found. Most good threads have some debate, so heat needs sharp
 * replies and a good share of them pushing back; sides alone, with plenty of pushback, make a
 * discussion lively.
 */
export function levelOf(a: Pick<SpiceGrade, 'sharp' | 'flame' | 'split' | 'pushback'>): SpiceLevel {
  // ponytail: thresholds set from 31 probed threads (most heated HN threads: sharp 0.5-0.75,
  // pushback 0.45-0.65; calm ones under 0.2 and 0.4). Recheck on fresh threads when the model changes.
  // Personal attacks in the tone itself. How many people are hostile names the reason, not the
  // level: a few snipers in a big, sharp thread (three on one Ask HN) don't make it a flamewar.
  if (a.flame >= 0.4) return 3
  if (a.sharp >= 0.6 && a.pushback >= 0.45) return 2
  if ((a.sharp >= 0.45 && a.pushback >= 0.4) || (a.split >= 0.7 && a.pushback >= 0.5)) return 1
  return 0
}

const r2 = (x: number) => Math.round(x * 100) / 100

export function gradeFrom({ state, sources }: Pick<Built, 'state' | 'sources'>, a: JevAnswers, comments: number, now = Date.now()): SpiceGrade {
  const p = (level: number) => a.tone.probabilities[String(level)] ?? 0
  const of = (prefix: string) => Object.entries(a.items).filter(([k]) => k.startsWith(prefix))
  const pushes = of('push_').map(([, v]) => v.noul)
  const author = new Map(state.comments.map((c) => [`hostile_${c.id}`, c.author]))
  // People, not replies: one person sniping all thread long is not a flamewar.
  const hostile = new Set(
    of('hostile_')
      .filter(([, v]) => v.noul >= YES)
      .map(([k]) => author.get(k)),
  )
  const g = {
    heat: r2(a.tone.score),
    confidence: r2(a.tone.confidence),
    sharp: r2(p(2) + p(3)),
    flame: r2(p(3)),
    split: r2(a.split.noul),
    // The expected share of replies that push back: the probabilities added up, not a vote.
    pushback: pushes.length ? r2(pushes.reduce((s, x) => s + x, 0) / pushes.length) : 0,
    hostile: hostile.size,
  }
  // The comments that said yes, surest first, one per person, to jump to.
  const refs = (prefix: string): SpiceRef[] => {
    const seen = new Set<string>()
    return of(prefix)
      .filter(([, v]) => v.noul >= YES)
      .sort((x, y) => y[1].noul - x[1].noul)
      .map(([k]) => state.comments[Number(k.slice(prefix.length)) - 1])
      .filter((c) => c && !seen.has(c.author) && seen.add(c.author) && sources[c.id - 1])
      .map((c) => ({ id: sources[c.id - 1], author: c.author }))
  }
  const disputed = refs('disputes_')
  const insights: SpiceInsights = {
    sad: r2(a.sad.noul),
    delighted: r2(a.delighted.noul),
    warm: r2(a.warm.noul),
    political: r2(a.political.noul),
    // One person saying the headline is wrong is an opinion; two is worth a look.
    disputed: disputed.length >= 2 ? disputed.slice(0, MAX_REFS) : [],
    answers: a.items.asks_help.noul >= YES ? refs('answers_').slice(0, MAX_REFS) : [],
  }
  return { ...g, level: levelOf(g), insights, comments, at: now, v: GRADE_VERSION }
}

/** A thread too small to grade: calm, and not looked at again until it grows. */
export const quiet = (comments: number, now = Date.now()): SpiceGrade => ({
  level: 0,
  heat: 0,
  confidence: 0,
  sharp: 0,
  flame: 0,
  split: 0,
  pushback: 0,
  hostile: 0,
  comments,
  at: now,
  v: GRADE_VERSION,
})

/** Bumped when the questions change, so older grades are redone once. */
export const GRADE_VERSION = 5

/**
 * Whether a story is worth (re)grading: big enough, and either never graded or grown by half
 * since (and not regraded in the last half hour). `comments` is the client's count, a hint: the
 * server grades from the thread it fetches itself.
 */
export function needsGrade(key: string, comments: number, grade: SpiceGrade | undefined, now = Date.now()): boolean {
  const min = spiceMin(key) ?? Infinity
  if (comments < min) return false
  if (!grade || grade.v !== GRADE_VERSION) return true
  return comments >= grade.comments * 1.5 && comments - grade.comments >= Math.min(20, min) && now - grade.at > 30 * 60_000
}

export const JEV_MODEL = process.env.TYPESAFE_MODEL || 'jev-1.14.0'

/** One request to Jev. Retries once when busy; any other failure is an error, never an answer. */
async function systemOne(state: unknown, questions: Record<string, unknown>, apiKey: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: JEV_MODEL, state, questions }),
      signal: AbortSignal.timeout(20_000),
    })
    if ((res.status === 429 || res.status === 529) && attempt === 0) {
      await new Promise((r) => setTimeout(r, Math.min(5000, Number(res.headers.get('retry-after')) * 1000 || 1500)))
      continue
    }
    if (!res.ok) throw new Error(`Jev answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
    const answers = ((await res.json()) as { answers?: Record<string, unknown> }).answers ?? {}
    if (Object.keys(questions).some((q) => !answers[q])) throw new Error('Jev left out an answer')
    return answers
  }
}

/**
 * Three requests at once: the thread-wide questions over the trimmed discussion, then the
 * per-reply and per-comment ones, which carry their own text and need only the post as state.
 * Those two are kept apart so each stays well inside Jev's context limit on a big thread.
 */
export async function askJev(state: SpiceState, apiKey: string): Promise<JevAnswers> {
  const perReply = replyQuestions(state)
  const [thread, replies, tops] = await Promise.all([
    systemOne(state, THREAD_QUESTIONS, apiKey),
    Object.keys(perReply).length ? systemOne({ story: state.story }, perReply, apiKey) : {},
    systemOne({ story: state.story }, topQuestions(state), apiKey),
  ])
  return { ...(thread as Omit<JevAnswers, 'items'>), items: { ...replies, ...tops } as JevAnswers['items'] }
}
