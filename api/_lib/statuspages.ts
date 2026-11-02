import type { Comment, Story, Thread } from '../../src/lib/types.js'
import { assertPublicUrl, fetchJson } from './http.js'

// Incidents from providers' Atlassian Statuspage pages: what they admit is broken, as stories,
// with each update as a reply. GET /api/v2/incidents.json is public and lists the last 25–50.
// Twilio's page is left out: it posts dozens of carrier-level SMS and voice delays a week.

export { STATUS_PAGES, type StatusPage } from '../../src/lib/statusPageList.js'
import { STATUS_PAGES, type StatusPage } from '../../src/lib/statusPageList.js'
import { escapeHtml, textHtml } from './text.js'

interface Update {
  id: string
  status: string
  body: string
  display_at?: string
  created_at: string
}
export interface Incident {
  id: string
  name: string
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved' | 'postmortem'
  impact: 'none' | 'minor' | 'major' | 'critical'
  created_at: string
  started_at?: string | null
  resolved_at?: string | null
  components?: { name: string }[]
  incident_updates: Update[]
}

/**
 * Engagement stand-in: there are no votes, so a story's weight is its impact, half again while it
 * lasts. A major incident sits with a solid HN story; a minor one stays below the fold of a topic.
 */
const IMPACT: Record<Incident['impact'], number> = { critical: 300, major: 100, minor: 30, none: 0 }
const WEEK = 7 * 24 * 3_600_000

const ongoing = (i: Incident) => i.status !== 'resolved' && i.status !== 'postmortem'
const label = (status: string) => status.charAt(0).toUpperCase() + status.slice(1)

export function duration(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h < 24) return rest ? `${h} h ${rest} min` : `${h} h`
  return `${Math.round(h / 24)} days`
}

export function incidentStory(page: StatusPage, i: Incident): Story {
  const start = Date.parse(i.started_at || i.created_at)
  const latest = i.incident_updates[0]
  const state = ongoing(i) ? `Ongoing: ${i.status}` : i.resolved_at ? `Resolved after ${duration(Date.parse(i.resolved_at) - start)}` : 'Resolved'
  const affects = i.components?.length ? `. Affects ${i.components.map((c) => c.name).join(', ')}` : ''
  return {
    // Built-in pages are keyed by id; followed ones by host, which can hold dashes, hence the ~.
    key: page.group === 'custom' ? `st-${page.host}~${i.id}` : `st-${page.id}-${i.id}`,
    source: 'status',
    sourceLabel: `${page.name} status`,
    title: i.name.trim(),
    url: null,
    discussionUrl: `https://${page.host}/incidents/${i.id}`,
    createdAt: start,
    text: `<p><strong>${escapeHtml(state)}</strong>, ${i.impact === 'none' ? 'no' : i.impact} impact${escapeHtml(affects)}.</p>\n${latest ? textHtml(latest.body) : ''}`,
    // Opening an incident shows its updates as the thread, so they're what this counts.
    comments: i.incident_updates.length,
    // Topic terms match on tags, so incidents land in SRE whatever their titles say.
    tags: ['incident', 'outage', page.name.toLowerCase()],
    site: page.site,
    hasThread: true,
    weight: IMPACT[i.impact] * (ongoing(i) ? 1.5 : 1),
  }
}

/** The updates, oldest first: how the incident unfolded. */
export function incidentThread(page: StatusPage, i: Incident): Thread {
  const comments: Comment[] = [...i.incident_updates]
    .reverse()
    .map((u) => ({ id: u.id, author: label(u.status), html: textHtml(u.body), createdAt: Date.parse(u.display_at || u.created_at), children: [] }))
  return { story: incidentStory(page, i), comments }
}

const HOST = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/

/** "https://status.clickhouse.com/incidents/x", "status.clickhouse.com" or just "clickhouse" -> "status.clickhouse.com". */
export function normalizeStatusHost(input: string): string | undefined {
  const s = input.trim().toLowerCase()
  if (!s) return undefined
  if (/^[a-z0-9-]+$/.test(s)) return `status.${s}.com`
  try {
    const host = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname
    return HOST.test(host) ? host : undefined
  } catch {
    return undefined
  }
}

/** A page a reader follows: the host is its identity until the page names itself. */
export function customPage(host: string, name?: string): StatusPage {
  const site = host.replace(/^(www|status)\./, '')
  return { id: host, name: name ?? site, host, site, group: 'custom' }
}

/** Pages name themselves "Mistral AI Status" or "ClickHouse Cloud"; rows add "status" themselves. */
const pageName = (name: string) => name.replace(/\s+status$/i, '').trim()

/** The most followed pages one request reads. Each is a fetch, so a long list would slow everyone's Status channel. */
export const MAX_CUSTOM = 25

async function incidentsOf(page: StatusPage): Promise<{ name?: string; incidents: Incident[] }> {
  // A page a reader typed in could point anywhere; only public hosts get fetched.
  if (page.group === 'custom') await assertPublicUrl(`https://${page.host}/`)
  const res = await fetchJson<{ page?: { name?: string }; incidents?: Incident[] }>(`https://${page.host}/api/v2/incidents.json`, { timeoutMs: 6000, redirect: 'error' })
  if (!Array.isArray(res.incidents)) throw new Error(`${page.host} doesn't publish a Statuspage incident feed`)
  return { name: res.page?.name ? pageName(res.page.name) : undefined, incidents: res.incidents }
}

/** Checks a page before it's followed: is it public, and does it publish incidents? Returns how it names itself. */
export async function checkStatusPage(input: string): Promise<{ host: string; name: string; builtIn?: true }> {
  const host = normalizeStatusHost(input)
  if (!host) throw new Error('That doesn’t look like a status page address')
  const builtIn = STATUS_PAGES.find((p) => p.host === host)
  if (builtIn) return { host, name: builtIn.name, builtIn: true }
  try {
    const { name } = await incidentsOf(customPage(host))
    return { host, name: name ?? customPage(host).name }
  } catch {
    throw new Error(`${host} doesn’t publish incidents in the Statuspage format PaperWing reads. Atlassian and incident.io pages work; Instatus and Better Stack pages don’t yet`)
  }
}

/** Notices with no impact (maintenance chatter, "retroactive" notes) aren't incidents worth reading. */
const matters = (i: Incident) => i.impact !== 'none'

/**
 * Incidents from the last week, plus anything still open. `active` keeps only the open ones.
 * `ids` picks built-in pages (all of them when empty); `hosts` adds pages a reader follows.
 */
export async function statusIncidents(ids: string[], active: boolean, hosts: string[] = []): Promise<Story[]> {
  const builtIn = ids.length ? STATUS_PAGES.filter((p) => ids.includes(p.id)) : STATUS_PAGES
  const custom = [...new Set(hosts.map(normalizeStatusHost).filter((h): h is string => !!h))]
    .filter((h) => !STATUS_PAGES.some((p) => p.host === h))
    .slice(0, MAX_CUSTOM)
    .map((h) => customPage(h))
  const now = Date.now()
  const results = await Promise.allSettled(
    [...builtIn, ...custom].map(async (p) => {
      const { name, incidents } = await incidentsOf(p)
      const page = p.group === 'custom' && name ? { ...p, name } : p
      return incidents.filter((i) => matters(i) && (active ? ongoing(i) : ongoing(i) || now - Date.parse(i.created_at) < WEEK)).map((i) => incidentStory(page, i))
    }),
  )
  if (results.every((r) => r.status === 'rejected')) throw new Error('No status page answered')
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).sort((a, b) => b.createdAt - a.createdAt)
}

/** One incident's timeline, by its story key. */
export async function statusThread(key: string): Promise<Thread> {
  const rest = key.replace(/^st-/, '')
  let page: StatusPage | undefined
  let id: string | undefined
  if (rest.includes('~')) {
    const [host, incident] = rest.split('~')
    page = HOST.test(host) ? (STATUS_PAGES.find((p) => p.host === host) ?? customPage(host)) : undefined
    id = incident
  } else {
    const [pageId, incident] = rest.split('-')
    page = STATUS_PAGES.find((p) => p.id === pageId)
    id = incident
  }
  if (!page || !id) throw new Error('Unknown incident')
  const { name, incidents } = await incidentsOf(page)
  const incident = incidents.find((i) => i.id === id)
  if (!incident) throw new Error('This incident has rolled off the status page')
  return incidentThread(page.group === 'custom' && name ? { ...page, name } : page, incident)
}
