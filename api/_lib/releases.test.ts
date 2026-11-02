import { describe, expect, it } from 'vitest'
import { parseReleases } from './sources'

// The shape of https://github.com/<repo>/releases.atom.
const now = Date.parse('2026-10-26T00:00:00Z')
const entry = (tag: string, title: string, updated: string) => `
  <entry>
    <id>tag:github.com,2008:Repository/1/${tag}</id>
    <updated>${updated}</updated>
    <link rel="alternate" type="text/html" href="https://github.com/prometheus/prometheus/releases/tag/${tag}"/>
    <title>${title}</title>
    <content type="html">&lt;h2&gt;Changes&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;Faster TSDB compaction&lt;/li&gt;&lt;/ul&gt;</content>
    <author><name>roidelapluie</name></author>
    <media:thumbnail height="30" width="30" url="https://avatars.githubusercontent.com/u/1?s=60&amp;v=4"/>
  </entry>`
const feed = (entries: string) => `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xml:lang="en-US"><title>Release notes from prometheus</title>${entries}</feed>`

describe('parseReleases', () => {
  it('keeps the newest stable releases and names the project', () => {
    const out = parseReleases(feed(entry('v3.8.0-rc.0', '3.8.0-rc.0 / 2026-10-24', '2026-10-24T10:00:00Z') + entry('v3.7.2', '3.7.2 / 2026-10-20', '2026-10-20T10:00:00Z') + entry('v3.7.1', 'v3.7.1', '2026-10-10T10:00:00Z') + entry('v3.7.0', '3.7.0', '2026-10-01T10:00:00Z')), 'prometheus/prometheus', now)
    expect(out.map((s) => s.title)).toEqual(['prometheus v3.7.2: 3.7.2 / 2026-10-20', 'prometheus v3.7.1'])
    expect(out[0]).toMatchObject({ source: 'release', sourceLabel: 'prometheus/prometheus', url: 'https://github.com/prometheus/prometheus/releases/tag/v3.7.2' })
    // The feed's media:thumbnail is the author's avatar, not a picture of the release.
    expect(out[0].thumbnail).toBeUndefined()
    expect(out[0].text).toContain('Faster TSDB compaction')
  })
  it('drops releases older than 45 days', () => {
    expect(parseReleases(feed(entry('v2.0.0', 'v2.0.0', '2026-07-01T00:00:00Z')), 'prometheus/prometheus', now)).toEqual([])
  })
})
