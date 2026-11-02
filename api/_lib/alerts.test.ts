import { describe, expect, it } from 'vitest'
import { emptyState, incidentSource, planAlerts, pushPayload, type AlertPrefs, type SubRecord, type World } from './alerts'
import type { Story } from '../../src/lib/types'

const prefs = (o: Partial<AlertPrefs> = {}): AlertPrefs => ({ edition: true, replies: true, outages: true, incidents: ['github', 'status.clickhouse.com'], watched: [], ...o })
const sub = (alerts: AlertPrefs, state = emptyState()): SubRecord => ({ endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' }, alerts, state })
const incident = (key: string, weight: number): Story => ({
  key,
  source: 'status',
  sourceLabel: 'GitHub status',
  title: 'Actions degraded',
  url: null,
  discussionUrl: null,
  createdAt: 0,
  hasThread: true,
  weight,
  text: '<p><strong>Ongoing: investigating</strong>, major impact. Affects Actions.</p>\n<p>We are looking.</p>',
})
const world = (o: Partial<World> = {}): World => ({ incidents: [], counts: new Map(), spikes: [], now: 1_000_000_000, ...o })

describe('alerts', () => {
  it('knows which page an incident is from', () => {
    expect(incidentSource('st-github-abc')).toBe('github')
    expect(incidentSource('st-status.my-vendor.io~abc')).toBe('status.my-vendor.io')
  })

  it('announces a major incident from a page you picked, once', () => {
    const w = world({ incidents: [incident('st-github-1', 150), incident('st-github-2', 45), incident('st-vercel-3', 300)] })
    const first = planAlerts(sub(prefs()), w)
    expect(first.notices.map((n) => n.tag)).toEqual(['st-github-1'])
    expect(first.notices[0]).toMatchObject({ title: 'GitHub: Actions degraded', body: 'Ongoing: investigating, major impact. Affects Actions.', url: '/t/status/st-github-1' })
    expect(planAlerts(sub(prefs(), first.state), w).notices).toEqual([])
  })

  it('counts replies from when you last looked, not from when the thread started', () => {
    const watched = [{ key: 'hn-1', title: 'A thread', lookedAt: 100 }]
    // First sight sets the baseline: nothing to say.
    const a = planAlerts(sub(prefs({ watched })), world({ counts: new Map([['hn-1', 40]]) }))
    expect(a.notices).toEqual([])
    const b = planAlerts(sub(prefs({ watched }), a.state), world({ counts: new Map([['hn-1', 43]]) }))
    expect(b.notices[0]).toMatchObject({ title: '3 new replies', body: 'A thread', tag: 'replies' })
    // You read it: start again from there.
    const c = planAlerts(sub(prefs({ watched: [{ ...watched[0], lookedAt: 200 }] }), b.state), world({ counts: new Map([['hn-1', 44]]) }))
    expect(c.notices).toEqual([])
    expect(planAlerts(sub(prefs({ watched: [{ ...watched[0], lookedAt: 200 }] }), c.state), world({ counts: new Map([['hn-1', 45]]) })).notices[0].title).toBe('1 new reply')
  })

  it('says a provider might be down at most every six hours', () => {
    const spike = { id: 'github', name: 'GitHub', recent: 9, baseline: 1, level: 'spike' as const, samples: [] }
    const a = planAlerts(sub(prefs()), world({ spikes: [spike] }))
    expect(a.notices[0].title).toBe('Possible GitHub outage')
    expect(planAlerts(sub(prefs(), a.state), world({ spikes: [spike], now: 1_000_000_000 + 3_600_000 })).notices).toEqual([])
    expect(planAlerts(sub(prefs(), a.state), world({ spikes: [spike], now: 1_000_000_000 + 7 * 3_600_000 })).notices).toHaveLength(1)
  })

  it('respects what you turned off, and counts the badge', () => {
    const spike = { id: 'github', name: 'GitHub', recent: 9, baseline: 1, level: 'spike' as const, samples: [] }
    const off = planAlerts(sub(prefs({ outages: false, incidents: [] })), world({ spikes: [spike], incidents: [incident('st-github-1', 300)] }))
    expect(off.notices).toEqual([])
    const on = planAlerts(sub(prefs()), world({ spikes: [spike], incidents: [incident('st-github-1', 300)] }))
    expect(on.state.unseen).toBe(2)
  })

  it('writes Declarative Web Push with an absolute link and the badge', () => {
    const p = JSON.parse(pushPayload({ title: 't', body: 'b', url: '/today', tag: 'edition' }, 'https://readout.example', 3))
    expect(p).toMatchObject({ web_push: 8030, notification: { title: 't', navigate: 'https://readout.example/today', app_badge: '3' } })
  })
})
