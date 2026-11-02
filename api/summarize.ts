import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { DiscussionSummary, SummaryRequest } from '../src/lib/summaryTypes.js'
import { clientKey, fail, json, readJson, today } from './_lib/http.js'
import { kv, kvConfigured, overLimit } from './_lib/kv.js'

// Summaries of a story's discussion (HN, Lobsters, Bluesky), not of the article: what people
// argue about, where they disagree, which comments are worth reading. Runs on the deployment's
// ANTHROPIC_API_KEY, or on a reader's own key sent in x-anthropic-key for that request only.

const MODEL = process.env.SUMMARY_MODEL || 'claude-opus-5-5'
// Per visitor per day when the deployment's own key pays; a reader's own key isn't capped.
const DAILY_LIMIT = Number(process.env.SUMMARY_DAILY_LIMIT || 40)
// All callers together, so the deployment's key has a hard daily ceiling however many addresses ask.
const GLOBAL_DAILY_LIMIT = Number(process.env.SUMMARY_GLOBAL_DAILY_LIMIT || 500)
const MAX_INPUT_CHARS = 140_000
const CACHE_SECONDS = 3 * 86_400

const Summary = z.object({
  gist: z.string().describe('Two or three sentences: what the discussion is about and how people are reacting overall.'),
  themes: z
    .array(
      z.object({
        title: z.string().describe('A few words.'),
        summary: z.string().describe('One to three sentences.'),
        comments: z.array(z.string()).describe('Refs of the comments that make this point.'),
      }),
    )
    .describe('The main lines of discussion, most discussed first. Three to six.'),
  disagreements: z
    .array(z.object({ question: z.string(), sides: z.array(z.object({ view: z.string(), comments: z.array(z.string()) })) }))
    .describe('Real points of contention, with each side. Empty if people broadly agree.'),
  standouts: z
    .array(z.object({ comment: z.string().describe('One ref.'), why: z.string().describe('Why it is worth reading, in one sentence.') }))
    .describe('Up to four comments worth reading in full: firsthand experience, corrections, real expertise.'),
  contrast: z.string().nullable().describe('If the threads come from more than one place, how the reaction differs between them. Otherwise null.'),
})

const SYSTEM = `You summarize online discussions of a story for a reader deciding which conversations are worth their time.

Each comment is given as [ref] author (score): text, indented by reply depth. Cite comments only by the refs shown, exactly as written. Describe what commenters say rather than judging who is right, and don't add facts that aren't in the comments. Prefer specific points over generic ones ("several people report X broke after the update" beats "people share experiences"). If the threads are short or thin, say so in the gist and keep the other sections short or empty.`

function render(req: SummaryRequest): string {
  const parts = [`Story: ${req.title}${req.url ? `\nLink: ${req.url}` : ''}`]
  for (const t of req.threads) {
    const shown = t.comments.length < t.total ? ` (the ${t.comments.length} most-upvoted of ${t.total} comments)` : ''
    parts.push(
      `\n## ${t.source}: ${t.title}${shown}\n` +
        t.comments.map((c) => `${'  '.repeat(Math.min(c.depth, 6))}[${c.ref}] ${c.author}${c.score !== undefined ? ` (${c.score})` : ''}: ${c.text}`).join('\n'),
    )
  }
  return parts.join('\n')
}

export async function GET(request: Request): Promise<Response> {
  if (!new URL(request.url).searchParams.has('status')) return fail('POST a discussion to summarize', 405)
  return json({ server: !!process.env.ANTHROPIC_API_KEY, model: MODEL }, 300)
}

export async function POST(request: Request): Promise<Response> {
  const ownKey = request.headers.get('x-anthropic-key')?.trim()
  const apiKey = ownKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) return fail('Summaries need an Anthropic API key: add ANTHROPIC_API_KEY to the deployment, or your own key in Settings', 501)

  const body = await readJson<SummaryRequest>(request)
  if (!body) return fail('Body must be JSON')
  if (!body.title || !Array.isArray(body.threads) || !body.threads.some((t) => t.comments?.length)) return fail('Nothing to summarize')
  const prompt = render(body)
  if (prompt.length > MAX_INPUT_CHARS) return fail('Discussion too long to send in one request', 413)

  const store = kvConfigured() ? kv() : undefined
  const cacheKey = `rd:summary:${MODEL}:${createHash('sha256').update(prompt).digest('hex').slice(0, 40)}`
  const cached = await store?.get(cacheKey).catch(() => null)
  if (cached) return json({ summary: JSON.parse(cached) as DiscussionSummary, model: MODEL, cached: true }, 0)

  // The deployment's own key only with a working counter: no counter, no free summaries.
  if (!ownKey) {
    if (!store) return fail('Add your own Anthropic key in Settings to get summaries', 401)
    const day = today()
    // Your own allowance first: a caller already over it mustn't use up everyone else's (as in spice.ts).
    const over = (await overLimit(`rd:summary-quota:${clientKey(request)}:${day}`, 86_400, DAILY_LIMIT)) || (await overLimit(`rd:summary-quota:*:${day}`, 86_400, GLOBAL_DAILY_LIMIT))
    if (over) return fail(`Daily summary limit reached on this deployment. Add your own Anthropic key in Settings to keep going.`, 429)
  }

  const client = new Anthropic({ apiKey })
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      output_config: { effort: 'medium', format: betaZodOutputFormat(Summary) },
      // If a safety classifier declines, the API retries on the model Anthropic recommends for that case.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    if (response.stop_reason === 'refusal') return fail('Claude declined to summarize this discussion', 422)
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) return fail('The summary came back incomplete. Try again', 502)
    const summary = response.parsed_output as DiscussionSummary
    await store?.set(cacheKey, JSON.stringify(summary), CACHE_SECONDS).catch(() => {})
    return json({ summary, model: response.model, cached: false }, 0)
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return fail(ownKey ? 'Your Anthropic key was rejected' : 'The deployment’s Anthropic key was rejected', 401)
    if (err instanceof Anthropic.RateLimitError) return fail('Claude is rate limited right now. Try again in a minute', 429)
    if (err instanceof Anthropic.APIError) return fail(`Claude API error ${err.status}: ${err.message}`, 502)
    return fail(err instanceof Error ? err.message : 'Summary failed', 502)
  }
}
