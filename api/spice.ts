import { waitUntil } from '@vercel/functions'
import { spiceMin, type SpiceGrade, type SpiceResponse, type SpoilerCheck, type SpoilerResponse } from '../src/lib/spiceTypes.js'
import { clientKey, fail, json, today } from './_lib/http.js'
import { kv, kvConfigured, overLimit } from './_lib/kv.js'
import { askJev, buildState, checkSpoilers, fetchDiscussion, FICTION_YES, GRADE_VERSION, JEV_MODEL, levelOf, needsGrade, needsSpoilerCheck, quiet, gradeFrom, validKey } from './_lib/spice.js'

// GET /api/spice?keys=hn-123~240,lb-abc~55: the spice grades known for those stories (each key
// with the comment count the client sees). Stories that are big enough and ungraded, or have grown
// a lot since, are graded in the background after the response, and listed as pending so the
// client asks again shortly. Grades are shared by every reader and kept for two weeks.
//
// GET /api/spice?spoilers=hn-123~240: the comments in that thread likely to give a plot away, for
// the reader to fold. Only a thread whose grade says it's about fiction is ever checked.
//
// Needs TYPESAFE_API_KEY (and the Upstash database). Grading and spoiler checks are capped per day
// (SPICE_DAILY_LIMIT, SPOILER_DAILY_LIMIT), which bounds the cost whatever anyone sends.

const KEEP_SECONDS = 14 * 86_400
const PER_REQUEST = 6
const DAILY_LIMIT = Number(process.env.SPICE_DAILY_LIMIT || 3000)
const CALLER_LIMIT = 60
const MAX_KEYS = 60
const COOL_SECONDS = 600
const SPOILER_DAILY_LIMIT = Number(process.env.SPOILER_DAILY_LIMIT || 500)

const gradeKey = (key: string) => `rd:spice:${key}`
const spoilerKey = (key: string) => `rd:spoilers:${key}`

const failed = (key: string) => async (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.warn('spice', key, message)
  await kv()
    .set('rd:spice-error', JSON.stringify({ key, message, at: Date.now() }), 7 * 86_400)
    .catch(() => {})
}

async function spoilers(asked: string, request: Request, apiKey: string): Promise<Response> {
  const [key, n] = asked.split('~')
  if (!validKey(key)) return fail('spoilers=<key>~<comments> required')
  const comments = Math.max(0, Math.min(100_000, Number(n) || 0))
  const store = kv()
  const [held, graded] = await store.mget([spoilerKey(key), gradeKey(key)])
  const check = held ? (JSON.parse(held) as SpoilerCheck) : undefined
  const ids = check?.ids ?? []
  // The server's own grade decides, so no request can spend the budget on a thread with no plot.
  const fiction = graded ? ((JSON.parse(graded) as SpiceGrade).insights?.fiction ?? 0) : 0
  if (fiction < FICTION_YES || !needsSpoilerCheck(check, comments)) return json({ ids, pending: false } satisfies SpoilerResponse, 60)
  // One check per thread at a time; each reader's share and the day's budget as for grading.
  const lock = `rd:spoiler-lock:${key}`
  if (await overLimit(lock, 300, 1)) return json({ ids, pending: true } satisfies SpoilerResponse, 0)
  const day = today()
  if ((await overLimit(`rd:spice-caller:${clientKey(request)}:${day}`, 86_400, CALLER_LIMIT)) || (await overLimit(`rd:spoiler-budget:${day}`, 86_400, SPOILER_DAILY_LIMIT))) {
    await store.bump(lock, 300, -1).catch(() => {})
    return json({ ids, pending: false } satisfies SpoilerResponse, 0)
  }
  waitUntil(
    checkSpoilers(key, apiKey)
      .then((c) => store.set(spoilerKey(key), JSON.stringify(c), KEEP_SECONDS))
      .catch(failed(key)),
  )
  return json({ ids, pending: true } satisfies SpoilerResponse, 0)
}

async function grade(key: string, apiKey: string) {
  const store = kv()
  const { title, text, comments } = await fetchDiscussion(key)
  const built = buildState(title, comments, text)
  const { state, total } = built
  const g: SpiceGrade = total < (spiceMin(key) ?? Infinity) || state.comments.length < 8 ? quiet(total) : gradeFrom(built, await askJev(state, apiKey), total)
  await store.set(gradeKey(key), JSON.stringify(g), KEEP_SECONDS)
}

export async function GET(request: Request): Promise<Response> {
  const apiKey = process.env.TYPESAFE_API_KEY
  const params = new URL(request.url).searchParams
  // ?status: whether grading works, how much of today's budget is spent, and the last failure.
  if (params.has('status')) {
    const day = today()
    const store = kvConfigured() ? kv() : undefined
    const [used, lastError] = store ? await store.mget([`rd:spice-budget:${day}`, 'rd:spice-error']).catch(() => [null, null]) : [null, null]
    // When the last failure was, not what it said: an upstream's error text isn't ours to publish.
    const failed = lastError ? (JSON.parse(lastError) as { at?: number }) : null
    return json({ enabled: !!apiKey && !!store, model: JEV_MODEL, today: Number(used) || 0, limit: DAILY_LIMIT, lastError: failed ? { at: failed.at ?? null } : null }, 0)
  }
  if (!apiKey || !kvConfigured()) return json({ enabled: false, grades: {}, pending: [] } satisfies SpiceResponse, 3600)
  const spoilerAsk = params.get('spoilers')
  if (spoilerAsk) return spoilers(spoilerAsk, request, apiKey)

  const raw = params.get('keys') ?? ''
  const asked = raw
    .split(',')
    .slice(0, MAX_KEYS)
    .map((part) => {
      const [key, n] = part.split('~')
      return { key, comments: Math.max(0, Math.min(100_000, Number(n) || 0)) }
    })
    .filter((a) => validKey(a.key))
  if (!asked.length) return fail('keys=<key>~<comments>,… required')

  const store = kv()
  const stored = await store.mget(asked.map((a) => gradeKey(a.key))).catch(() => asked.map(() => null))
  const grades: Record<string, SpiceGrade> = {}
  stored.forEach((s, i) => {
    if (!s) return
    // The level is worked out again on the way out, so retuned thresholds apply to every grade
    // asked the current questions; older ones keep theirs until they're regraded.
    const g = JSON.parse(s) as SpiceGrade
    grades[asked[i].key] = g.v === GRADE_VERSION ? { ...g, level: levelOf(g) } : g
  })

  const pending: string[] = []
  const day = today()
  // A source that rate-limited us gets a rest before we fetch from it again.
  const prefixes = [...new Set(asked.map((a) => a.key.slice(0, 2)))]
  const cooling = await store.mget(prefixes.map((p) => `rd:spice-cool:${p}`)).catch(() => [])
  const resting = new Set(prefixes.filter((_, i) => cooling[i]))
  for (const a of asked) {
    if (pending.length >= PER_REQUEST || resting.has(a.key.slice(0, 2)) || !needsGrade(a.key, a.comments, grades[a.key])) continue
    // One grader per story at a time, however many readers ask.
    const lock = `rd:spice-lock:${a.key}`
    if (await overLimit(lock, 300, 1)) {
      pending.push(a.key)
      continue
    }
    // Each reader starts only a few gradings a day, so no one caller can spend everyone's budget.
    // Out of either, this reader grades nothing: the story is let go, or nobody else could grade it
    // until the lock ran out.
    if ((await overLimit(`rd:spice-caller:${clientKey(request)}:${day}`, 86_400, CALLER_LIMIT)) || (await overLimit(`rd:spice-budget:${day}`, 86_400, DAILY_LIMIT))) {
      await store.bump(lock, 300, -1).catch(() => {})
      break
    }
    pending.push(a.key)
    waitUntil(
      grade(a.key, apiKey).catch(async (err) => {
        const message = err instanceof Error ? err.message : String(err)
        console.warn('spice', a.key, message)
        if (/\b429\b/.test(message) && !message.startsWith('Jev')) await store.set(`rd:spice-cool:${a.key.slice(0, 2)}`, '1', COOL_SECONDS).catch(() => {})
        await store.set('rd:spice-error', JSON.stringify({ key: a.key, message, at: Date.now() }), 7 * 86_400).catch(() => {})
      }),
    )
  }

  // Short CDN caching: the same rows are asked about by everyone reading the feed.
  return json({ enabled: true, grades, pending } satisfies SpiceResponse, pending.length ? 0 : 60)
}
