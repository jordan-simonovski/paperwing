import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Story, Thread } from '../../src/lib/types.js'
import { countOf, dateOf, noticesIn, noticeStory, parseCsv, type Notice } from '../_lib/warn.js'
import { GET as feed } from '../feed.js'
import { GET as thread } from '../thread.js'
import { call, fakeUpstreams } from './harness.js'
import { workbook } from './xlsx.js'

// WARN notices: each state's own table in, stories for employers PaperWing follows out.

const net = fakeUpstreams()
const NOW = Date.parse('2026-11-04T12:00:00Z')
beforeEach(() => void vi.useFakeTimers({ toFake: ['Date'], now: NOW }))
afterEach(() => void vi.useRealTimers())

const notice = (n: Partial<Notice> = {}): Notice => ({ state: 'wa', filer: 'Microsoft Corporation', noticed: '2026-09-22', workers: 277, place: 'Redmond', kind: 'Layoff', ...n })

/** California's report as it ships: a title row, then headers with line breaks in them. */
const caReport = (rows: string) =>
  workbook(
    {
      Index: '<row r="1"><c r="A1" t="inlineStr"><is><t>About this report</t></is></c></row>',
      'Detailed WARN Report ':
        '<row r="1"><c r="A1" t="inlineStr"><is><t>WARN REPORT - 07/01/26 to 11/02/2026</t></is></c></row>' +
        '<row r="2">' +
        ['County/Parish', 'Notice\r\nDate', 'Processed\r\nDate', 'Effective \r\nDate', 'Company', 'Layoff/\r\nClosure', 'No. Of\r\nEmployees', 'Address']
          .map((h, i) => `<c r="${'ABCDEFGH'[i]}2" t="inlineStr"><is><t>${h}</t></is></c>`)
          .join('') +
        '</row>' +
        rows,
    },
    [],
  )
const caRow = (r: number, company: string, notice: number, workers: number) =>
  `<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>Santa Clara County</t></is></c><c r="B${r}"><v>${notice}</v></c><c r="C${r}"><v>${notice}</v></c><c r="D${r}"><v>${notice + 60}</v></c>` +
  `<c r="E${r}" t="inlineStr"><is><t>${company}</t></is></c><c r="F${r}" t="inlineStr"><is><t>Layoff Permanent</t></is></c><c r="G${r}"><v>${workers}</v></c><c r="H${r}" t="inlineStr"><is><t>2200 Mission College Blvd Santa Clara CA 95054</t></is></c></row>`

function californiaServes(rows: string) {
  net
    .get('https://edd.ca.gov')
    .intercept({ path: '/en/jobs_and_training/Layoff_Services_WARN' })
    .reply(200, '<a href="/siteassets/files/jobs_and_training/warn/warn_report1.xlsx">WARN report</a> <a href="/siteassets/files/old.pdf">2024</a>')
  net
    .get('https://edd.ca.gov')
    .intercept({ path: '/siteassets/files/jobs_and_training/warn/warn_report1.xlsx' })
    .reply(200, Buffer.from(caReport(rows)))
}

describe('the warn source', () => {
  it('turns a state’s spreadsheet into stories, only for employers PaperWing follows', async () => {
    // 46317 is 22 October 2026; 46000 is 9 December 2025, outside the window.
    californiaServes(caRow(3, 'Intel Corporation - SC-12', 46317, 67) + caRow(4, "McDonald's Corporation", 46317, 2) + caRow(5, 'Oracle America, Inc.', 46000, 279))
    const res = await call<Story[]>(feed, '/api/feed?src=warn&state=ca')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ title: 'Intel gives notice of 67 layoffs in California', source: 'warn', sourceLabel: 'California WARN notices', url: null, site: 'edd.ca.gov' })
    expect(res.body[0].text).toContain('2200 Mission College Blvd')
    expect(res.headers.get('cache-control')).toContain('s-maxage=10800')
  })

  it('opens a notice by its key', async () => {
    californiaServes(caRow(3, 'Intel Corporation - SC-12', 46317, 67))
    const [story] = (await call<Story[]>(feed, '/api/feed?src=warn&state=ca')).body
    californiaServes(caRow(3, 'Intel Corporation - SC-12', 46317, 67))
    const res = await call<Thread>(thread, `/api/thread?src=warn&id=${story.key}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ story: { key: story.key }, comments: [] })
  })

  it('reads a paged web table (Washington), newest first', async () => {
    const table = (rows: string[][]) =>
      `<table><tr><th>Company</th><th>Location</th><th>Layoff Start Date</th><th># of Workers</th><th>Closure Layoff</th><th>Type of Layoff</th><th>Received Date</th></tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`
    net
      .get('https://fortress.wa.gov')
      .intercept({ path: '/esd/file/warn/Public/SearchWARN.aspx' })
      .reply(
        200,
        table([
          ['Amazon', 'Seattle', '12/7/2026', '95', 'Layoff', 'Permanent', '11/2/2026'],
          ['Old Co', 'Spokane', '1/1/2026', '10', 'Layoff', 'Permanent', '1/1/2026'],
        ]),
      )
    const res = await call<Story[]>(feed, '/api/feed?src=warn&state=wa')
    expect(res.body.map((s) => s.title)).toEqual(['Amazon gives notice of 95 layoffs in Seattle, Washington'])
  })

  it('refuses a state it doesn’t read', async () => {
    expect((await call(feed, '/api/feed?src=warn&state=zz')).status).toBe(400)
    expect((await call(feed, '/api/feed?src=warn&state=hasOwnProperty')).status).toBe(400)
  })

  it('says so when a state changes its table, rather than serving nothing', async () => {
    net.get('https://edd.ca.gov').intercept({ path: '/en/jobs_and_training/Layoff_Services_WARN' }).reply(200, '<a href="/siteassets/files/jobs_and_training/warn/warn_report1.xlsx">WARN report</a>')
    net
      .get('https://edd.ca.gov')
      .intercept({ path: '/siteassets/files/jobs_and_training/warn/warn_report1.xlsx' })
      .reply(200, Buffer.from(workbook({ 'Detailed WARN Report': '<row r="1"><c r="A1" t="inlineStr"><is><t>Something else</t></is></c></row>' })))
    const res = await call<{ error: string }>(feed, '/api/feed?src=warn&state=ca')
    expect(res.status).toBe(502)
    expect(res.body.error).toContain('changed shape')
  })
})

describe('noticeStory', () => {
  it('names the employer, the headcount and the place', () => {
    expect(noticeStory(notice())?.title).toBe('Microsoft gives notice of 277 layoffs in Redmond, Washington')
    expect(noticeStory(notice({ workers: undefined, kind: 'Closure' }))?.title).toBe('Microsoft gives notice of layoffs in Redmond, Washington, closing the site')
  })

  it('names the state when the place is a street address or the whole state', () => {
    expect(noticeStory(notice({ place: '1 Microsoft Way Redmond WA 98052' }))?.title).toMatch(/in Washington$/)
    expect(noticeStory(notice({ place: 'Statewide' }))?.title).toMatch(/in Washington$/)
    expect(noticeStory(notice({ place: 'Sumner, Pasco, Bellevue, Redmond, Seattle and Remote' }))?.title).toBe('Microsoft gives notice of 277 layoffs in Washington')
  })

  it('leaves out employers PaperWing doesn’t follow', () => {
    expect(noticeStory(notice({ filer: 'Acme Markets, Inc.' }))).toBeUndefined()
  })

  it('keys a notice by what it says, so the same notice keeps its key', () => {
    expect(noticeStory(notice())?.key).toBe(noticeStory(notice())?.key)
    expect(noticeStory(notice())?.key).not.toBe(noticeStory(notice({ workers: 278 }))?.key)
    expect(noticeStory(notice())?.key).toMatch(/^wn-wa-[0-9a-z]+$/)
  })

  it('escapes what the state wrote', () => {
    expect(noticeStory(notice({ place: '<img src=x onerror=alert(1)>' }))?.text).not.toContain('<img')
  })
})

describe('reading state tables', () => {
  it('reads dates as states write them', () => {
    expect(dateOf(46317)).toBe('2026-10-22')
    expect(dateOf('10/30/2026')).toBe('2026-10-30')
    expect(dateOf('10/30/26')).toBe('2026-10-30')
    expect(dateOf('2026-10-27 00:00:00')).toBe('2026-10-27')
    expect(dateOf('October 30, 2026')).toBe('2026-10-30')
    expect(dateOf('Sep 15, 2026')).toBe('2026-09-15')
    expect(dateOf('TBD')).toBeUndefined()
    expect(dateOf('13/45/2026')).toBeUndefined()
  })

  it('reads headcounts, and nothing from words or ranges', () => {
    expect(countOf('1,200')).toBe(1200)
    expect(countOf(359)).toBe(359)
    expect(countOf('Unknown')).toBeUndefined()
    expect(countOf('50-100')).toBeUndefined()
  })

  it('finds the header row under title rows, and keeps only rows a filter allows', () => {
    const rows = [['Illinois layoffs'], ['Location Name', 'WARN Notice', 'Initial Date Reported', 'Expected Layoff'], ['Uber Technologies, Inc.', 'TRUE', 46300, 363], ['Someone', 'FALSE', 46300, 10]]
    const found = noticesIn('il', rows, { filer: /^location name/, noticed: /initial date/, workers: /expected/ }, (_, at) => at(/^warn notice/) === 'TRUE')
    expect(found).toEqual([{ state: 'il', filer: 'Uber Technologies, Inc.', noticed: '2026-10-05', workers: 363, starts: undefined, place: undefined, kind: undefined }])
  })

  it('parses CSV with quotes, commas and line breaks inside fields', () => {
    expect(parseCsv('Company,Notice Date\r\n"Acme, Inc.","10/30/2026"\n"Say ""hi""\nthere",x\n')).toEqual([
      ['Company', 'Notice Date'],
      ['Acme, Inc.', '10/30/2026'],
      ['Say "hi"\nthere', 'x'],
    ])
  })
})
