import type { ProviderReport } from '../../src/lib/outageTypes.js'

export type { ProviderReport }

// Outage watch: people saying a service is down, counted per provider, set against what the
// provider's status page admits. The signal is a jump in distinct people posting in the last
// half hour compared with the hour and a half before.

export interface Provider {
  id: string
  name: string
  /** Matches a mention of the provider. */
  pattern: RegExp
  /** Atlassian Statuspage host, when the provider has one (GET /api/v2/status.json). */
  statuspage?: string
}

export const PROVIDERS: Provider[] = [
  { id: 'aws', name: 'AWS', pattern: /\b(aws|amazon web services|us-east-1)\b/i },
  { id: 'gcp', name: 'Google Cloud', pattern: /\b(gcp|google cloud)\b/i },
  { id: 'azure', name: 'Azure', pattern: /\bazure\b/i },
  { id: 'cloudflare', name: 'Cloudflare', pattern: /\bcloudflare\b/i, statuspage: 'www.cloudflarestatus.com' },
  { id: 'github', name: 'GitHub', pattern: /\bgithub\b/i, statuspage: 'www.githubstatus.com' },
  { id: 'gitlab', name: 'GitLab', pattern: /\bgitlab\b/i },
  { id: 'openai', name: 'OpenAI', pattern: /\b(openai|chatgpt|chat gpt)\b/i, statuspage: 'status.openai.com' },
  { id: 'claude', name: 'Claude', pattern: /\b(claude|anthropic)\b/i, statuspage: 'status.claude.com' },
  { id: 'gemini', name: 'Gemini', pattern: /\bgemini\b/i },
  { id: 'vercel', name: 'Vercel', pattern: /\bvercel\b/i, statuspage: 'www.vercel-status.com' },
  { id: 'netlify', name: 'Netlify', pattern: /\bnetlify\b/i, statuspage: 'www.netlifystatus.com' },
  { id: 'fly', name: 'Fly.io', pattern: /\bfly\.io\b/i, statuspage: 'status.flyio.net' },
  { id: 'supabase', name: 'Supabase', pattern: /\bsupabase\b/i, statuspage: 'status.supabase.com' },
  { id: 'datadog', name: 'Datadog', pattern: /\bdatadog\b/i, statuspage: 'status.datadoghq.com' },
  { id: 'npm', name: 'npm', pattern: /\bnpm\b/i, statuspage: 'status.npmjs.org' },
  { id: 'docker', name: 'Docker Hub', pattern: /\bdocker( ?hub)?\b/i, statuspage: 'www.dockerstatus.com' },
  { id: 'digitalocean', name: 'DigitalOcean', pattern: /\bdigital ?ocean\b/i, statuspage: 'status.digitalocean.com' },
  { id: 'twilio', name: 'Twilio', pattern: /\btwilio\b/i, statuspage: 'status.twilio.com' },
  { id: 'atlassian', name: 'Atlassian', pattern: /\b(atlassian|jira|confluence|bitbucket)\b/i, statuspage: 'status.atlassian.com' },
  { id: 'slack', name: 'Slack', pattern: /\bslack\b/i },
  { id: 'discord', name: 'Discord', pattern: /\bdiscord\b/i, statuspage: 'discordstatus.com' },
  { id: 'zoom', name: 'Zoom', pattern: /\bzoom\b/i },
  { id: 'stripe', name: 'Stripe', pattern: /\bstripe\b/i },
  { id: 'microsoft', name: 'Microsoft 365', pattern: /\b(outlook|microsoft teams|ms teams|office 365|microsoft 365|m365)\b/i },
  { id: 'google', name: 'Google Workspace', pattern: /\b(gmail|google docs|google drive|google workspace)\b/i },
  { id: 'bluesky', name: 'Bluesky', pattern: /\b(bluesky|bsky)\b/i },
  { id: 'x', name: 'X', pattern: /\b(twitter|x\.com)\b/i },
]

/** An outage claim, not just the word "down": "is down", "outage", "502s", "not loading". */
const OUTAGE =
  /\b(is|are|was|went|seems?|looks?|appears?|still|totally|completely|fully)\s+(down|offline|broken)\b|\bdown (for (anyone|everyone|me)|again|right now|rn)\b|\b(outage|outages|degraded|502s?|503s?|500 errors?)\b|\b(not|isn'?t|won'?t) (loading|working|responding)\b|\bhaving (issues|problems)\b/i
// Bots that relay status pages, and posts about prices or markets "going down".
const NOT_A_REPORT = /^\s*(⚠️|✅|🔴|🟠|🟡|🟢|🚨)|\b(stock|shares?|price|dow|nasdaq|s&p|bitcoin|crypto)\b/i

export interface Mention {
  text: string
  author: string
  at: number
  url: string
}

const RECENT = 30 * 60_000
const WINDOW = 120 * 60_000

/** Splits text into sentences so the provider and the complaint have to be in the same one. */
const sentences = (text: string) => text.split(/(?<=[.!?\n])\s+/)

export function matchProviders(raw: string): Provider[] {
  // Handles and links name services without saying anything about them (@someone.bsky.social).
  const text = raw.replace(/@[\w.-]+/g, ' ').replace(/https?:\/\/\S+/g, ' ')
  if (NOT_A_REPORT.test(text)) return []
  return PROVIDERS.filter((p) => sentences(text).some((s) => p.pattern.test(s) && OUTAGE.test(s)))
}

export function detectOutages(mentions: Mention[], now = Date.now()): ProviderReport[] {
  const byProvider = new Map<string, { recent: Map<string, Mention>; before: Set<string> }>()
  for (const m of mentions) {
    const age = now - m.at
    if (age < 0 || age > WINDOW) continue
    for (const p of matchProviders(m.text)) {
      const entry = byProvider.get(p.id) ?? { recent: new Map(), before: new Set() }
      if (age <= RECENT) entry.recent.set(m.author, m)
      else entry.before.add(m.author)
      byProvider.set(p.id, entry)
    }
  }
  const out: ProviderReport[] = []
  for (const [id, e] of byProvider) {
    const p = PROVIDERS.find((x) => x.id === id)!
    const recent = e.recent.size
    const baseline = e.before.size / 3
    // A spike: enough people, and well above how many were saying it before.
    const level = recent >= 5 && recent >= 3 * (baseline + 1) ? 'spike' : recent >= 2 ? 'chatter' : 'quiet'
    const samples = [...e.recent.values()]
      .sort((a, b) => b.at - a.at)
      .slice(0, 4)
      .map((m) => ({ text: m.text.slice(0, 220), url: m.url, at: m.at }))
    out.push({ id, name: p.name, recent, baseline: Math.round(baseline * 10) / 10, level, samples })
  }
  const rank = { spike: 0, chatter: 1, quiet: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level] || b.recent - a.recent)
}
