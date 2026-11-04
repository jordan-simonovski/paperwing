import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Story, Thread } from '../../src/lib/types.js'
import { kv } from '../_lib/kv.js'
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

  it('says a notice that has aged out is still on the state’s list, not deleted', async () => {
    californiaServes(caRow(3, 'Intel Corporation - SC-12', 46317, 67))
    const res = await call<{ error: string }>(thread, '/api/thread?src=warn&id=wn-ca-zzzzzz')
    expect(res.status).toBe(404)
    expect(res.body.error).toContain('no longer in the last 120 days of California’s WARN list')
    expect(res.body.error).not.toContain('deleted')
  })

  it('refuses a malformed notice key before reading any state', async () => {
    // No upstream is faked: a fetch would fail the test.
    expect((await call(thread, '/api/thread?src=warn&id=wn-ca-../../x')).status).toBe(400)
    expect((await call(thread, '/api/thread?src=warn&id=wn-zz-abc')).status).toBe(404)
  })

  it('charges a notice link against the caller’s fan-out allowance, failing closed', async () => {
    vi.spyOn(kv(), 'bump').mockRejectedValueOnce(new Error('Sync store answered 503'))
    expect((await call(thread, '/api/thread?src=warn&id=wn-ca-abc123')).status).toBe(429)
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

  it('remembers a state it couldn’t read for a while, rather than asking it again for every reader', async () => {
    process.env.SYNC_MEMORY = '1'
    try {
      net.get('https://edd.ca.gov').intercept({ path: '/en/jobs_and_training/Layoff_Services_WARN' }).reply(503, 'busy')
      expect((await call(feed, '/api/feed?src=warn&state=ca')).status).toBe(502)
      // Nothing else is faked: a second read of the state would fail the test.
      const again = await call<{ error: string }>(feed, '/api/feed?src=warn&state=ca')
      expect(again.status).toBe(502)
      expect(again.body.error).toContain('503')
    } finally {
      delete process.env.SYNC_MEMORY
    }
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

// Each state's own way of publishing, from a tiny fixture in its real shape: the page, the file and
// the requests it takes. Every case has one tracked employer, so a story coming out proves the
// adapter found the right link, the right sheet and the right columns.
describe('each state’s adapter', () => {
  const inline = (r: number, cells: (string | number | undefined)[]) =>
    `<row r="${r}">${cells.map((c, i) => (c === undefined ? '' : typeof c === 'number' ? `<c r="${'ABCDEFGHIJ'[i]}${r}"><v>${c}</v></c>` : `<c r="${'ABCDEFGHIJ'[i]}${r}" t="inlineStr"><is><t>${c}</t></is></c>`)).join('')}</row>`
  const sheet = (rows: (string | number | undefined)[][]) => rows.map((cells, i) => inline(i + 1, cells)).join('')
  const titles = async (state: string) => {
    const res = await call<Story[]>(feed, `/api/feed?src=warn&state=${state}`)
    expect(res.status).toBe(200)
    return res.body.map((s) => s.title)
  }

  it('New York: the CSV behind its Tableau dashboard', async () => {
    net
      .get('https://public.tableau.com')
      .intercept({ path: '/views/WorkerAdjustmentRetrainingNotificationWARN/WARN.csv?:showVizHome=n' })
      .reply(
        200,
        'Business Legal Name,Date Layoff/Closure Starts,Date of WARN Notice ,Impacted Site Address,Layoff or Closure?,Number of Affected Workers \nIBM Corporation,2026-12-01,2026-10-02,"1 New Orchard Rd, Armonk, NY, 10504",Layoff,120\n',
      )
    expect(await titles('ny')).toEqual(['IBM gives notice of 120 layoffs in New York'])
  })

  it('Texas: this year’s listing, found by its link', async () => {
    net
      .get('https://www.twc.texas.gov')
      .intercept({ path: '/data-reports/warn-notice' })
      .reply(200, '<a href="/sites/default/files/oei/docs/warn-act-listings-2026-twc.xlsx">2026</a> <a href="/sites/default/files/oei/docs/warn-act-listings-2024-twc.xlsx">2024</a>')
    net
      .get('https://www.twc.texas.gov')
      .intercept({ path: '/sites/default/files/oei/docs/warn-act-listings-2026-twc.xlsx' })
      .reply(
        200,
        Buffer.from(
          workbook({
            Sheet1: sheet([
              ['NOTICE_DATE', 'JOB_SITE_NAME', 'TOTAL_LAYOFF_NUMBER', 'LayOff_Date', 'CITY_NAME'],
              [46322, 'Oracle America, Inc.', 82, 46387, 'Austin'],
            ]),
          }),
        ),
      )
    expect(await titles('tx')).toEqual(['Oracle gives notice of 82 layoffs in Austin, Texas'])
  })

  it('Illinois: only rows its export marks as WARN notices', async () => {
    net
      .get('https://apps.illinoisworknet.com')
      .intercept({ path: (p) => p.startsWith('/iebs/api/public/export?') })
      .reply(
        200,
        Buffer.from(
          workbook({
            Layoffs: sheet([
              ['Location Name', 'Location City', 'WARN Notice', 'Reason', 'Expected Layoff', 'Initial Date Reported'],
              ['Uber Technologies, Inc.', 'Chicago', 'TRUE', 'Restructuring', 363, 46300],
              ['Salesforce, Inc.', 'Chicago', 'FALSE', 'Other', 12, 46300],
            ]),
          }),
        ),
      )
    expect(await titles('il')).toEqual(['Uber gives notice of 363 layoffs in Chicago, Illinois'])
  })

  it('New Jersey: the month a notice was posted, from this year’s sheet', async () => {
    net
      .get('https://www.nj.gov')
      .intercept({ path: '/labor/assets/PDFs/WARN/WARN_Notice_Archive.xlsx' })
      .reply(
        200,
        Buffer.from(
          workbook({
            '2026 WARN Notices': sheet([
              ['Company', 'City', 'Month Posted', 'Effective Date', 'Workforce Affected'],
              ['Meta Platforms, Inc.', 'Statewide', 'October', 46400, 74],
            ]),
          }),
        ),
      )
    const res = await call<Story[]>(feed, '/api/feed?src=warn&state=nj')
    expect(res.body.map((s) => [s.title, new Date(s.createdAt).toISOString().slice(0, 10)])).toEqual([['Meta gives notice of 74 layoffs in New Jersey', '2026-10-01']])
  })

  it('Georgia: replays the page’s table settings, nonce included, with its cookie', async () => {
    net
      .get('https://www.tcsg.edu')
      .intercept({ path: '/warn-public-view/' })
      .reply(
        200,
        '<script>window.gvDTglobals.push({"ajax":{"url":"https:\\/\\/www.tcsg.edu\\/wp-admin\\/admin-ajax.php","type":"POST","data":{"action":"gv_datatables_data","view_id":77460,"nonce":"f425","shortcode_atts":{"id":77460}}}});</script>',
        { headers: { 'set-cookie': 'wp=1; Path=/' } },
      )
    net
      .get('https://www.tcsg.edu')
      .intercept({ method: 'POST', path: '/wp-admin/admin-ajax.php', body: (b) => b.includes('nonce=f425') && b.includes('shortcode_atts%5Bid%5D=77460'), headers: { cookie: 'wp=1' } })
      .reply(200, { data: [{ 0: '<a href="https://www.tcsg.edu/warn-public-view/entry/1/">GA2026001</a>', 1: 'Salesforce, Inc.', 2: 'October 30, 2026', 3: '67' }] })
    expect(await titles('ga')).toEqual(['Salesforce gives notice of 67 layoffs in Georgia'])
  })

  it('Oregon: posts its form with the anti-forgery token for the spreadsheet', async () => {
    const start = '/Layoff/WARN/Download'
    net
      .get('https://ccwd.hecc.oregon.gov')
      .intercept({ path: start })
      .reply(200, '<form><input name="__RequestVerificationToken" type="hidden" value="tok123" /></form>', { headers: { 'set-cookie': 'af=9; Path=/' } })
    net
      .get('https://ccwd.hecc.oregon.gov')
      .intercept({ method: 'POST', path: start, body: (b) => b.includes('__RequestVerificationToken=tok123') && b.includes('WARNFormat=xlsx'), headers: { cookie: 'af=9' } })
      .reply(200, '<a class="btn btn-primary" href="/Layoff/WARN/Download/GetFile?id=77">Download</a>')
    net
      .get('https://ccwd.hecc.oregon.gov')
      .intercept({ path: '/Layoff/WARN/Download/GetFile?id=77' })
      .reply(
        200,
        Buffer.from(
          workbook({
            Sheet1: sheet([
              ['Oregon WARN notices'],
              [],
              ['WARN#', 'Company Name', 'Location', 'Layoff Date', 'Laid Off', 'Layoff Type', 'Received Date'],
              [9651, 'Intel Corporation', 'Hillsboro', 46387, 150, 'Large Layoff', 46320],
            ]),
          }),
        ),
      )
    expect(await titles('or')).toEqual(['Intel gives notice of 150 layoffs in Hillsboro, Oregon'])
  })

  it('Virginia: the CSV export its page links, whatever it’s called today', async () => {
    net.get('https://www.virginiaworks.gov').intercept({ path: '/warn-notices/' }).reply(200, '<a href="/warn_notices_1793760343.csv">Download</a>')
    net
      .get('https://www.virginiaworks.gov')
      .intercept({ path: '/warn_notices_1793760343.csv' })
      .reply(200, 'Company,Notice Date,Impact Date,Employees Affected,Location,Notice Type\n"Amazon.com Services LLC",10/30/2026,12/31/2026,201,Herndon,Layoff\n')
    expect(await titles('va')).toEqual(['Amazon gives notice of 201 layoffs in Herndon, Virginia'])
  })

  it('Maryland: this year’s table on the page itself', async () => {
    net
      .get('https://www.dllr.state.md.us')
      .intercept({ path: '/employment/warn.shtml' })
      .reply(
        200,
        '<table><tr><th>Notice Date</th><th>NAICS</th><th>Company</th><th>Location</th><th>Total Employees</th></tr><tr><td>10/30/2026</td><td>5182</td><td>Amazon Data Services, Inc.</td><td>Baltimore</td><td>88</td></tr></table>',
      )
    expect(await titles('md')).toEqual(['Amazon gives notice of 88 layoffs in Baltimore, Maryland'])
  })

  it('Connecticut: the document library’s JSON listing, with the cookie its page sets', async () => {
    net
      .get('https://dolpublicdocumentlibrary.ct.gov')
      .intercept({ path: '/CsblrCategory?prefix=%2Frapid_response%2Fwarn_documents' })
      .reply(200, '<html></html>', { headers: { 'set-cookie': 'lib=5; Path=/' } })
    net
      .get('https://dolpublicdocumentlibrary.ct.gov')
      .intercept({ path: (p) => p.startsWith('/CsblrCategory/GetSpecializedData?'), headers: { cookie: 'lib=5' } })
      .reply(200, {
        totalPages: 1,
        blobItems: [{ blobProperties: { affected_company: 'Oracle America, Inc.', warn_document_received_date: '10/29/2026', number_of_impacted_workers: '31', layoff_locations: 'Stamford' } }],
      })
    expect(await titles('ct')).toEqual(['Oracle gives notice of 31 layoffs in Stamford, Connecticut'])
  })

  it('Arizona: its paged search, which gives no headcount', async () => {
    const page = (rows: string[][]) =>
      `<table><tr><th>Employer</th><th>City</th><th>ZIP</th><th>Notice Date</th><th>WARN Type</th></tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`
    net
      .get('https://www.azjobconnection.gov')
      .intercept({ path: (p) => p.startsWith('/search/warn_lookups?') && p.includes('page=1') })
      .reply(200, page([['PayPal, Inc.', 'Scottsdale', '85260', 'Sep 15, 2026', 'WARN']]))
    expect(await titles('az')).toEqual(['PayPal gives notice of layoffs in Scottsdale, Arizona'])
  })

  it('Arizona: says so when its first page has no table, rather than serving no notices', async () => {
    net
      .get('https://www.azjobconnection.gov')
      .intercept({ path: (p) => p.startsWith('/search/warn_lookups?') })
      .reply(200, '<p>Service unavailable</p>')
    expect((await call(feed, '/api/feed?src=warn&state=az')).status).toBe(502)
  })

  it('Washington: follows its pages until they reach back past the window', async () => {
    const page = (rows: string[][]) =>
      `<form><input type="hidden" name="__VIEWSTATE" value="vs${rows.length}" /><input type="hidden" name="__EVENTVALIDATION" value="ev" /></form><table><tr><th>Company</th><th>Location</th><th>Layoff Start Date</th><th># of Workers</th><th>Type of Layoff</th><th>Received Date</th></tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`
    const path = '/esd/file/warn/Public/SearchWARN.aspx'
    net
      .get('https://fortress.wa.gov')
      .intercept({ path })
      .reply(200, page([['Amazon', 'Seattle', '12/7/2026', '95', 'Permanent', '11/2/2026']]))
    net
      .get('https://fortress.wa.gov')
      .intercept({ method: 'POST', path, body: (b) => b.includes('__EVENTARGUMENT=Page%242') && b.includes('__VIEWSTATE=vs1') })
      .reply(
        200,
        page([
          ['Expedia', 'Seattle', '11/20/2026', '58', 'Permanent', '9/22/2026'],
          ['Microsoft', 'Redmond', '3/1/2026', '10', 'Permanent', '1/5/2026'],
        ]),
      )
    // No third page is faked: asking for one would fail the test.
    expect(await titles('wa')).toEqual(['Amazon gives notice of 95 layoffs in Seattle, Washington', 'Expedia gives notice of 58 layoffs in Seattle, Washington'])
  })
})
