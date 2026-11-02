// The status pages PaperWing reads out of the box (api/_lib/statuspages.ts reads them; Settings lists them for alerts).

export interface StatusPage {
  /** No dashes: it's part of the story key, st-<id>-<incident>. */
  id: string
  name: string
  host: string
  /** The provider's own site, for its logo. */
  site: string
  /** `custom` for a page a reader follows themselves (Settings), named by the page itself. */
  group: 'ai' | 'cloud' | 'dev' | 'observability' | 'comms' | 'custom'
}

export const STATUS_PAGES: StatusPage[] = [
  { id: 'openai', name: 'OpenAI', host: 'status.openai.com', site: 'openai.com', group: 'ai' },
  { id: 'claude', name: 'Claude', host: 'status.claude.com', site: 'claude.ai', group: 'ai' },
  { id: 'cloudflare', name: 'Cloudflare', host: 'www.cloudflarestatus.com', site: 'cloudflare.com', group: 'cloud' },
  { id: 'vercel', name: 'Vercel', host: 'www.vercel-status.com', site: 'vercel.com', group: 'cloud' },
  { id: 'netlify', name: 'Netlify', host: 'www.netlifystatus.com', site: 'netlify.com', group: 'cloud' },
  { id: 'fly', name: 'Fly.io', host: 'status.flyio.net', site: 'fly.io', group: 'cloud' },
  { id: 'supabase', name: 'Supabase', host: 'status.supabase.com', site: 'supabase.com', group: 'cloud' },
  { id: 'digitalocean', name: 'DigitalOcean', host: 'status.digitalocean.com', site: 'digitalocean.com', group: 'cloud' },
  { id: 'render', name: 'Render', host: 'status.render.com', site: 'render.com', group: 'cloud' },
  { id: 'hashicorp', name: 'HashiCorp', host: 'status.hashicorp.com', site: 'hashicorp.com', group: 'cloud' },
  { id: 'github', name: 'GitHub', host: 'www.githubstatus.com', site: 'github.com', group: 'dev' },
  { id: 'npm', name: 'npm', host: 'status.npmjs.org', site: 'npmjs.com', group: 'dev' },
  { id: 'docker', name: 'Docker', host: 'www.dockerstatus.com', site: 'docker.com', group: 'dev' },
  { id: 'circleci', name: 'CircleCI', host: 'status.circleci.com', site: 'circleci.com', group: 'dev' },
  { id: 'atlassian', name: 'Atlassian', host: 'status.atlassian.com', site: 'atlassian.com', group: 'dev' },
  { id: 'datadog', name: 'Datadog', host: 'status.datadoghq.com', site: 'datadoghq.com', group: 'observability' },
  { id: 'grafana', name: 'Grafana Cloud', host: 'status.grafana.com', site: 'grafana.com', group: 'observability' },
  { id: 'honeycomb', name: 'Honeycomb', host: 'status.honeycomb.io', site: 'honeycomb.io', group: 'observability' },
  { id: 'sentry', name: 'Sentry', host: 'status.sentry.io', site: 'sentry.io', group: 'observability' },
  { id: 'newrelic', name: 'New Relic', host: 'status.newrelic.com', site: 'newrelic.com', group: 'observability' },
  { id: 'elastic', name: 'Elastic', host: 'status.elastic.co', site: 'elastic.co', group: 'observability' },
  { id: 'incidentio', name: 'incident.io', host: 'status.incident.io', site: 'incident.io', group: 'observability' },
  { id: 'discord', name: 'Discord', host: 'discordstatus.com', site: 'discord.com', group: 'comms' },
]

/** Status pages of your own (not built in) one device may follow for alerts: every alert run reads them all. */
export const MAX_ALERT_PAGES = 10

const isBuiltIn = (id: string) => STATUS_PAGES.some((p) => p.id === id)

/** The status pages a device's alerts can follow: every built-in one, and the first ten of your own. */
export const alertPages = Object.assign((ids: string[]) => [...ids.filter(isBuiltIn), ...ids.filter((id) => !isBuiltIn(id)).slice(0, MAX_ALERT_PAGES)], {
  /** Whether that's as many of your own as alerts take. */
  full: (ids: string[]) => ids.filter((id) => !isBuiltIn(id)).length >= MAX_ALERT_PAGES,
})
