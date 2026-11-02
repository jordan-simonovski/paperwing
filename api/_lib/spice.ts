import type { Comment } from '../../src/lib/types.js'
import { spiceMin, type SpiceGrade, type SpiceLevel } from '../../src/lib/spiceTypes.js'
import { parseLemmyKey } from '../../src/lib/lemmyKey.js'
import { fetchJson, stripHtml } from './http.js'
import { lobstersThread } from './sources.js'

// Spice: how heated a discussion is, which is not the same as how negative it is. A thread that
// agrees a company got it wrong is negative but calm; two camps arguing is spicy. Jev (TypeSafe's
// classifier) scores the heat on a four-level rubric and answers four yes/no questions about why;
// the level and its label are worked out here in code, as TypeSafe recommends.
//
// The server fetches each thread itself from fixed hosts, so a grade only ever reflects the real
// discussion: nobody can get a grade stored by sending made-up comments.

const MAX_COMMENTS = 80
const PER_COMMENT = 450
const MAX_CHARS = 26_000
const MAX_DEPTH = 5

export interface SpiceComment {
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

const blueskyUri = (key: string) => Buffer.from(key.slice(3), 'base64url').toString('utf8')

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
  body_html?: string
  user?: { username: string }
  children?: DevtoComment[]
}

/** Lemmy returns comments flat, each with its ancestry in `path` ("0.12.34"); rebuilt into a tree. */
export function lemmyTree(views: LemmyComment[]): SpiceComment[] {
  const byId = new Map<string, SpiceComment>()
  for (const v of views) byId.set(String(v.comment.id), { author: v.creator.name, text: v.comment.removed || v.comment.deleted ? '' : v.comment.content, children: [] })
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
  post?: { author: { handle: string }; record: { text?: string }; likeCount?: number }
  replies?: BskyNode[]
}

/** A thread's title and comment tree, best-first where the source ranks them. */
export async function fetchDiscussion(key: string): Promise<{ title: string; comments: SpiceComment[] }> {
  if (key.startsWith('hn-')) {
    const id = key.slice(3)
    const [item, ranked] = await Promise.all([
      fetchJson<AlgoliaItem & { title?: string }>(`https://hn.algolia.com/api/v1/items/${id}`),
      fetchJson<{ kids?: number[] } | null>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).catch(() => null),
    ])
    const order = new Map((ranked?.kids ?? []).map((k, i) => [k, i]))
    const map = (c: AlgoliaItem): SpiceComment => ({ author: c.author ?? '', text: c.text ? stripHtml(c.text) : '', children: c.children.filter((x) => x.type === 'comment').map(map) })
    const top = item.children.filter((c) => c.type === 'comment').sort((a, b) => (order.get(a.id) ?? 1e6) - (order.get(b.id) ?? 1e6))
    return { title: item.title ?? '', comments: top.map(map) }
  }
  if (key.startsWith('lm-')) {
    const lm = parseLemmyKey(key)
    if (!lm) throw new Error('Not a Lemmy post')
    const [{ post_view }, { comments }] = await Promise.all([
      fetchJson<{ post_view: { post: { name: string } } }>(`https://${lm.via}/api/v3/post?id=${lm.id}`),
      fetchJson<{ comments: LemmyComment[] }>(`https://${lm.via}/api/v3/comment/list?post_id=${lm.id}&max_depth=8&sort=Top&type_=All`),
    ])
    return { title: post_view.post.name, comments: lemmyTree(comments) }
  }
  if (key.startsWith('dv-')) {
    const id = key.slice(3)
    const [article, comments] = await Promise.all([fetchJson<{ title: string }>(`https://dev.to/api/articles/${id}`), fetchJson<DevtoComment[]>(`https://dev.to/api/comments?a_id=${id}`)])
    const map = (c: DevtoComment): SpiceComment => ({ author: c.user?.username ?? '', text: stripHtml(c.body_html ?? ''), children: (c.children ?? []).map(map) })
    return { title: article.title, comments: comments.map(map) }
  }
  if (key.startsWith('lb-')) {
    const thread = await lobstersThread(key.slice(3))
    const map = (c: Comment): SpiceComment => ({ author: c.author, text: c.deleted ? '' : stripHtml(c.html), children: c.children.map(map) })
    return { title: thread.story.title, comments: thread.comments.map(map) }
  }
  const { thread } = await fetchJson<{ thread: BskyNode }>(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(blueskyUri(key))}&depth=8&parentHeight=0`)
  const map = (n: BskyNode): SpiceComment => ({
    author: n.post?.author.handle ?? '',
    text: n.post?.record.text ?? '',
    children: (n.replies ?? [])
      .filter((r) => r.post)
      .sort((a, b) => (b.post!.likeCount ?? 0) - (a.post!.likeCount ?? 0))
      .map(map),
  })
  return { title: (thread.post?.record.text ?? '').split('\n')[0].slice(0, 200), comments: map(thread).children }
}

export interface SpiceState {
  title: string
  /** Each comment numbered in reading order; `reply_to` is the number of the comment it answers. */
  comments: { id: number; reply_to: number | null; author: string; text: string }[]
}

/** The top of the discussion, trimmed: Jev is most accurate with only what the question needs. */
export function buildState(title: string, tree: SpiceComment[]): { state: SpiceState; total: number } {
  const comments: SpiceState['comments'] = []
  let chars = 0
  const walk = (cs: SpiceComment[], parent: number | null, depth: number) => {
    for (const c of cs) {
      if (comments.length >= MAX_COMMENTS || chars >= MAX_CHARS) return
      let id = parent
      const text = c.text.replace(/\s+/g, ' ').trim()
      if (text) {
        const clipped = text.length > PER_COMMENT ? `${text.slice(0, PER_COMMENT)}…` : text
        id = comments.length + 1
        comments.push({ id, reply_to: parent, author: c.author, text: clipped })
        chars += clipped.length + c.author.length + 24
      }
      if (depth < MAX_DEPTH) walk(c.children, id, depth + 1)
    }
  }
  walk(tree, null, 0)
  return { state: { title, comments }, total: count(tree) }
}

export const QUESTIONS = {
  heat: {
    type: 'score',
    instructions: 'How heated is the disagreement between the commenters in `comments`?',
    criteria: [
      'Calm: commenters mostly agree with each other, add information or ask questions',
      'Some debate: a few commenters disagree with each other, politely and with reasons',
      'Heated: many commenters argue with each other, with sharp, dismissive or sarcastic replies',
      'Flamewar: commenters attack each other personally, with insults and open hostility',
    ],
  },
  split: { type: 'noul', instructions: 'The commenters in `comments` are divided into opposing sides about the story in `title`.' },
  pushback: { type: 'noul', instructions: 'Many comments in `comments` disagree with the comment their `reply_to` points at.' },
  // "At least one" is true of nearly every big thread, so this asks about several.
  hostile: { type: 'noul', instructions: 'Several different comments in `comments` insult, mock or belittle the commenter they reply to.' },
  pile_on: { type: 'noul', instructions: 'Most comments in `comments` criticise the same company, product, project or person, and agree with each other about it.' },
} as const

export interface JevAnswers {
  heat: { score: number; confidence: number }
  split: { noul: number }
  pushback: { noul: number }
  hostile: { noul: number }
  pile_on: { noul: number }
}

/**
 * The chillies, from Jev's answers. Most good threads have some debate, so one chilli also needs
 * real disagreement (sides and replies pushing back); otherwise every busy thread would get one.
 * Tuned on real grades of HN's busiest threads: Jev's heat lands between 1 and 2 for most of them.
 */
export function levelOf(a: Pick<SpiceGrade, 'heat' | 'split' | 'pushback'>): SpiceLevel {
  if (a.heat >= 2.3) return 3
  if (a.heat >= 1.75) return 2
  if (a.heat >= 1.3 && a.split >= 0.6 && a.pushback >= 0.5) return 1
  return 0
}

export function gradeFrom(answers: JevAnswers, comments: number, now = Date.now()): SpiceGrade {
  const g = {
    heat: Math.round(answers.heat.score * 100) / 100,
    confidence: Math.round(answers.heat.confidence * 100) / 100,
    split: Math.round(answers.split.noul * 100) / 100,
    pushback: Math.round(answers.pushback.noul * 100) / 100,
    hostile: Math.round(answers.hostile.noul * 100) / 100,
    pileOn: Math.round(answers.pile_on.noul * 100) / 100,
  }
  return { ...g, level: levelOf(g), comments, at: now, v: GRADE_VERSION }
}

/** A thread too small to grade: calm, and not looked at again until it grows. */
export const quiet = (comments: number, now = Date.now()): SpiceGrade => ({ level: 0, heat: 0, confidence: 0, split: 0, pushback: 0, hostile: 0, pileOn: 0, comments, at: now, v: GRADE_VERSION })

/** Bumped when the questions change, so older grades are redone once. */
export const GRADE_VERSION = 2

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

/** One request to Jev: the trimmed discussion as state, the five questions. Retries once when busy. */
export async function askJev(state: SpiceState, apiKey: string): Promise<JevAnswers> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: JEV_MODEL, state, questions: QUESTIONS }),
      signal: AbortSignal.timeout(20_000),
    })
    if ((res.status === 429 || res.status === 529) && attempt === 0) {
      await new Promise((r) => setTimeout(r, Math.min(5000, Number(res.headers.get('retry-after')) * 1000 || 1500)))
      continue
    }
    if (!res.ok) throw new Error(`Jev answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
    const data = (await res.json()) as { answers?: Partial<JevAnswers> }
    const a = data.answers
    if (!a?.heat || !a.split || !a.pushback || !a.hostile || !a.pile_on) throw new Error('Jev left out an answer')
    return a as JevAnswers
  }
}
