import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

// Upstash QStash runs PaperWing's alerts every five minutes and the daily edition. Adding QStash to the project from the
// Vercel Marketplace (the Upstash integration) sets everything used here: QSTASH_TOKEN and
// QSTASH_URL to manage the schedule, and the signing keys that prove a request came from QStash.
// PaperWing creates and keeps the schedule itself; nothing to set up by hand.

const TOKEN = process.env.QSTASH_TOKEN
const BASE = (process.env.QSTASH_URL ?? 'https://qstash.upstash.io').replace(/\/$/, '')
const KEYS = [process.env.QSTASH_CURRENT_SIGNING_KEY, process.env.QSTASH_NEXT_SIGNING_KEY].filter((k): k is string => !!k)

export const qstashConfigured = () => !!TOKEN && KEYS.length > 0

const b64url = (buf: Buffer) => buf.toString('base64url')

/**
 * True when the request carries a valid Upstash-Signature: a JWT signed with either signing key
 * (QStash rotates them), issued by Upstash, in date, for this URL and this body.
 */
export function verifyQStash(request: Request, body = '', now = Date.now()): boolean {
  const jwt = request.headers.get('upstash-signature')
  if (!jwt || !KEYS.length) return false
  const [header, payload, signature] = jwt.split('.')
  if (!header || !payload || !signature) return false
  const signed = KEYS.some((key) => {
    const expected = Buffer.from(b64url(createHmac('sha256', key).update(`${header}.${payload}`).digest()))
    const given = Buffer.from(signature)
    return expected.length === given.length && timingSafeEqual(expected, given)
  })
  if (!signed) return false
  let claims: { iss?: string; sub?: string; exp?: number; nbf?: number; body?: string }
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return false
  }
  const seconds = now / 1000
  if (claims.iss !== 'Upstash' || (claims.exp ?? 0) < seconds || (claims.nbf ?? 0) > seconds + 5) return false
  // The signature is for one destination; a copied header can't be replayed against another
  // endpoint. Compared by path and query, since proxies can present the host differently.
  const where = (u: string) => {
    const x = new URL(u)
    return `${x.pathname}${x.search}`
  }
  try {
    if (claims.sub && where(claims.sub) !== where(request.url)) return false
  } catch {
    return false
  }
  return claims.body === undefined || claims.body.replace(/=+$/, '') === b64url(createHash('sha256').update(body).digest())
}

/** What PaperWing schedules: alerts every five minutes, and the daily edition at 21:00 UTC (08:00 in Sydney in summer). */
export const SCHEDULES = [
  { id: 'readout-alerts', cron: '*/5 * * * *', task: 'alerts' },
  { id: 'readout-edition', cron: '0 21 * * *', task: 'edition' },
]

/**
 * With Vercel Authentication on, QStash can't reach the app without Vercel's automation bypass
 * secret (Deployment Protection, Protection Bypass for Automation, which sets this variable).
 * QStash forwards any Upstash-Forward-* header to the destination.
 */
const bypassHeaders = (): Record<string, string> => {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  return secret ? { 'Upstash-Forward-x-vercel-protection-bypass': secret } : {}
}

/** Changes whenever what ensureSchedules would send changes, so a redeploy with new settings re-creates them. */
export const scheduleSignature = (origin: string) =>
  createHash('sha256')
    .update(JSON.stringify([origin, SCHEDULES, bypassHeaders()]))
    .digest('hex')
    .slice(0, 16)

/**
 * Creates the schedules, or updates them in place (their ids make this idempotent). Only from
 * production, so a preview deployment never takes them over.
 */
export async function ensureSchedules(origin: string): Promise<boolean> {
  if (!TOKEN || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production')) return false
  const results = await Promise.all(
    SCHEDULES.map(async (s) => {
      const destination = `${origin.replace(/\/$/, '')}/api/push?task=${s.task}`
      const res = await fetch(`${BASE}/v2/schedules/${destination}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}`, 'Upstash-Schedule-Id': s.id, 'Upstash-Cron': s.cron, 'Upstash-Method': 'GET', 'Upstash-Retries': '0', ...bypassHeaders() },
        signal: AbortSignal.timeout(5000),
      })
      return res.ok
    }),
  )
  return results.every(Boolean)
}

/** The app's public address: what QStash should call and notification links should open. */
export const publicOrigin = (requestUrl: string) =>
  process.env.PUBLIC_ORIGIN ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : new URL(requestUrl).origin)
