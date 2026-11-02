import type { ProviderReport } from '../../src/lib/outageTypes.js'
import type { Story } from '../../src/lib/types.js'
import { stripHtml } from './http.js'

// What each device wants to hear about, and what it has already been told. The alert run reads
// the world once (incidents, reply counts, outage spikes), then plans each device's notifications
// here. Planning is pure so it can be tested without the network.

/** Sent by the device whenever these change; see src/lib/push.ts. */
export interface AlertPrefs {
  edition: boolean
  /** New replies in threads you watch. */
  replies: boolean
  /** People reporting a provider down (Outage watch spikes). */
  outages: boolean
  /** Status pages whose major and critical incidents you want: built-in ids or followed hosts. */
  incidents: string[]
  watched: { key: string; title: string; lookedAt: number }[]
}

export interface AlertState {
  /** Notifications since the device last opened PaperWing: the icon badge. */
  unseen: number
  /** Incidents already announced, newest last. */
  incidents: string[]
  /** Per watched thread: the count we last told you about, and when you last looked. */
  replies: Record<string, { lookedAt: number; count: number }>
  /** Provider -> when we last said it might be down. */
  outages: Record<string, number>
}

export interface SubRecord {
  endpoint: string
  keys: { p256dh: string; auth: string }
  alerts?: AlertPrefs
  state?: AlertState
}

export interface Notice {
  title: string
  body: string
  /** Path in the app to open on tap. */
  url: string
  tag: string
}

export interface World {
  /** Ongoing incidents across every page anyone asked for. */
  incidents: Story[]
  /** Current comment counts for watched threads. */
  counts: Map<string, number>
  /** Providers people are saying are down. */
  spikes: ProviderReport[]
  now: number
}

/** Only incidents a provider calls major or critical reach your phone (story weight, see statuspages.ts). */
const MAJOR = 100
/** One "might be down" per provider per six hours, however long the chatter lasts. */
const OUTAGE_QUIET = 6 * 3_600_000
/** A burst of incidents at one moment doesn't become a burst of notifications. */
const MAX_INCIDENTS_PER_RUN = 2

export const emptyState = (): AlertState => ({ unseen: 0, incidents: [], replies: {}, outages: {} })

/** Which page an incident story came from: `st-<id>-<incident>` for built-ins, `st-<host>~<incident>` for followed pages. */
export const incidentSource = (key: string) => {
  const rest = key.replace(/^st-/, '')
  return rest.includes('~') ? rest.split('~')[0] : rest.split('-')[0]
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function planAlerts(sub: SubRecord, world: World): { notices: Notice[]; state: AlertState } {
  const prefs = sub.alerts
  const state: AlertState = structuredClone(sub.state ?? emptyState())
  const notices: Notice[] = []
  if (!prefs) return { notices, state }

  // Incidents: each one once, when it's major or worse.
  const wanted = new Set(prefs.incidents)
  let announced = 0
  for (const s of world.incidents) {
    if (announced >= MAX_INCIDENTS_PER_RUN) break
    if (!wanted.has(incidentSource(s.key)) || (s.weight ?? 0) < MAJOR || state.incidents.includes(s.key)) continue
    state.incidents.push(s.key)
    announced++
    // The story's first paragraph reads "Ongoing: investigating, major impact. Affects …".
    const summary = stripHtml((s.text ?? '').split('</p>')[0]).replace(/\s+([,.;:])/g, '$1')
    notices.push({ title: `${s.sourceLabel.replace(/ status$/, '')}: ${s.title}`, body: summary, url: `/t/status/${s.key}`, tag: s.key })
  }
  state.incidents = state.incidents.slice(-300)

  // Replies: a thread's count when you last looked is its baseline; more than that is news.
  if (prefs.replies) {
    const fresh: { title: string; n: number; key: string }[] = []
    const next: AlertState['replies'] = {}
    for (const w of prefs.watched) {
      const count = world.counts.get(w.key)
      const held = state.replies[w.key]
      if (count === undefined) {
        if (held) next[w.key] = held
        continue
      }
      if (!held || w.lookedAt > held.lookedAt) {
        // New to us, or you've read it since: start counting from here.
        next[w.key] = { lookedAt: w.lookedAt, count }
        continue
      }
      if (count > held.count) fresh.push({ title: w.title, n: count - held.count, key: w.key })
      next[w.key] = { lookedAt: held.lookedAt, count: Math.max(count, held.count) }
    }
    state.replies = next
    if (fresh.length === 1) {
      const [f] = fresh
      notices.push({ title: `${plural(f.n, 'new reply', 'new replies')}`, body: f.title, url: `/saved/${f.key}?view=watching&tab=discussion`, tag: 'replies' })
    } else if (fresh.length > 1) {
      const total = fresh.reduce((n, f) => n + f.n, 0)
      notices.push({ title: `${plural(total, 'new reply', 'new replies')} in ${fresh.length} threads you watch`, body: fresh.map((f) => f.title).join(' · '), url: '/saved?view=watching', tag: 'replies' })
    }
  }

  // Outage watch: people saying a provider is down, at most every six hours each.
  if (prefs.outages) {
    for (const r of world.spikes) {
      if (r.level !== 'spike') continue
      if (world.now - (state.outages[r.id] ?? 0) < OUTAGE_QUIET) continue
      state.outages[r.id] = world.now
      const page = r.status && r.status.indicator !== 'none' ? ` Its status page says: ${r.status.description}.` : ' Its status page says nothing yet.'
      notices.push({ title: `Possible ${r.name} outage`, body: `${plural(r.recent, 'person', 'people')} reporting problems in the last 30 minutes.${page}`, url: '/t/sre', tag: `outage-${r.id}` })
    }
    for (const [id, at] of Object.entries(state.outages)) if (world.now - at > 2 * OUTAGE_QUIET) delete state.outages[id]
  }

  state.unseen += notices.length
  return { notices, state }
}

/**
 * A notification in Declarative Web Push form (Safari 18.4+ shows it without waking the service
 * worker, which makes iOS delivery dependable). Everywhere else the service worker reads the same
 * JSON and shows it itself. `app_badge` sets the icon badge.
 */
export function pushPayload(n: Notice, origin: string, badge: number): string {
  return JSON.stringify({
    web_push: 8030,
    notification: { title: n.title, body: n.body, navigate: new URL(n.url, origin).toString(), tag: n.tag, lang: 'en', dir: 'ltr', app_badge: String(badge) },
  })
}
