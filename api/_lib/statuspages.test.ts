import { describe, expect, it } from 'vitest'
import { customPage, duration, incidentStory, incidentThread, normalizeStatusHost, STATUS_PAGES, type Incident } from './statuspages'

const github = STATUS_PAGES.find((p) => p.id === 'github')!
const incident = (o: Partial<Incident> = {}): Incident => ({
  id: 'abc123',
  name: 'Incident with Actions ',
  status: 'resolved',
  impact: 'major',
  created_at: '2026-10-27T10:00:00Z',
  started_at: '2026-10-27T09:58:00Z',
  resolved_at: '2026-10-27T10:39:00Z',
  components: [{ name: 'Actions' }],
  incident_updates: [
    { id: 'u2', status: 'resolved', body: 'Fixed. See https://github.blog/x.', created_at: '2026-10-27T10:39:00Z' },
    { id: 'u1', status: 'investigating', body: 'We are <investigating>.', created_at: '2026-10-27T10:00:00Z' },
  ],
  ...o,
})

describe('status pages', () => {
  it('turns an incident into a story weighted by its impact', () => {
    const s = incidentStory(github, incident())
    expect(s).toMatchObject({ key: 'st-github-abc123', source: 'status', sourceLabel: 'GitHub status', title: 'Incident with Actions', url: null, discussionUrl: 'https://www.githubstatus.com/incidents/abc123', weight: 100, site: 'github.com' })
    expect(s.text).toContain('Resolved after 41 min')
    expect(s.text).toContain('Affects Actions')
    expect(s.tags).toContain('outage')
  })
  it('weighs an ongoing incident more', () => {
    expect(incidentStory(github, incident({ status: 'investigating', resolved_at: null })).weight).toBe(150)
  })
  it('tells the incident oldest update first, with text escaped and links kept', () => {
    const t = incidentThread(github, incident())
    expect(t.comments.map((c) => c.author)).toEqual(['Investigating', 'Resolved'])
    expect(t.comments[0].html).toContain('&lt;investigating&gt;')
    expect(t.comments[1].html).toContain('<a href="https://github.blog/x">')
  })
  it('keeps story keys parseable', () => {
    for (const p of STATUS_PAGES) expect(p.id).not.toContain('-')
  })
  it('says how long things took in plain words', () => {
    expect(duration(41 * 60_000)).toBe('41 min')
    expect(duration(150 * 60_000)).toBe('2 h 30 min')
    expect(duration(3 * 24 * 3_600_000)).toBe('3 days')
  })
})

describe('followed status pages', () => {
  it('reads an address however it is pasted', () => {
    expect(normalizeStatusHost('https://status.clickhouse.com/incidents/abc')).toBe('status.clickhouse.com')
    expect(normalizeStatusHost('status.clickhouse.com')).toBe('status.clickhouse.com')
    expect(normalizeStatusHost('clickhouse')).toBe('status.clickhouse.com')
    expect(normalizeStatusHost('not a host')).toBeUndefined()
    expect(normalizeStatusHost('http://localhost')).toBeUndefined()
  })
  it('keys a followed page by host, so hosts with dashes still parse', () => {
    const page = customPage('status.my-vendor.io', 'My Vendor')
    expect(incidentStory(page, incident()).key).toBe('st-status.my-vendor.io~abc123')
    expect(incidentStory(page, incident()).sourceLabel).toBe('My Vendor status')
    expect(customPage('status.clickhouse.com').site).toBe('clickhouse.com')
  })
})
