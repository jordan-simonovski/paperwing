import { parseHTML } from 'linkedom'
import { employerFiling } from '../../src/lib/employers.js'
import { WARN_STATES } from '../../src/lib/topics.js'
import type { Story, Thread } from '../../src/lib/types.js'
import { decodeEntities, readLimited, safeFetch, UA } from './http.js'
import { cachedInKv, kv, kvConfigured } from './kv.js'
import { escapeHtml } from './text.js'
import { excelDate, readXlsx, type Cell, type Row } from './xlsx.js'

// WARN notices: under the US WARN Act, an employer with 100 or more staff must give 60 days' notice
// of a mass layoff or closure, and each state publishes the notices it gets. Each state does it its
// own way (a spreadsheet, a CSV, a paged web table), so each has an adapter here that turns its
// table into notices. Only notices from employers PaperWing follows become stories. The ways in
// follow Big Local News's warn-scraper (Apache 2.0), which documents how each state publishes.
// Every host is fixed in code.

export type StateCode = (typeof WARN_STATES)[number]

export interface Notice {
  state: StateCode
  /** The filer as the state lists it, often with a site ("Intel Corporation - SC-12"). */
  filer: string
  /** When the state received or posted the notice (ISO date). */
  noticed: string
  /** When the layoffs start, when it says. */
  starts?: string
  workers?: number
  place?: string
  /** Layoff, closure, relocation…, as the state words it. */
  kind?: string
}

/** How long back a feed reaches: notices arrive about 60 days before layoffs start. */
export const WINDOW_DAYS = 120

/* ---------------------------------------------------------------- reading cells */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const iso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 1990 && y < 2100 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : undefined)

/** A date as states write it: an Excel day number, 10/30/2026, 10/30/26, 2026-10-30, "October 30, 2026". */
export function dateOf(v: Cell): string | undefined {
  if (typeof v === 'number') return excelDate(v)
  const s = (v ?? '').trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/.exec(s)
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2])
  m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/.exec(s)
  if (m) return iso(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2])
  return undefined
}

/** A headcount: "1,200" or 1200. Ranges and words ("Unknown") count as nothing. */
export function countOf(v: Cell): number | undefined {
  if (typeof v === 'number') return v > 0 && v < 1_000_000 ? Math.round(v) : undefined
  const m = /^\s*(\d[\d,]*)\s*$/.exec(v ?? '')
  const n = m ? Number(m[1].replace(/,/g, '')) : NaN
  return n > 0 && n < 1_000_000 ? n : undefined
}

const clean = (v: Cell) => (v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim())

interface Columns {
  filer: RegExp
  noticed: RegExp
  workers?: RegExp
  place?: RegExp
  starts?: RegExp
  kind?: RegExp
}

/**
 * Rows from a state's table, by its header names. The header row is the first one where every
 * named column is found, so title rows above it are skipped. Rows without a filer or a date are left out.
 */
export function noticesIn(state: StateCode, rows: Row[], columns: Columns, keep: (row: Row, at: (re: RegExp) => Cell) => boolean = () => true): Notice[] {
  const wanted = Object.entries(columns) as [keyof Columns, RegExp][]
  for (let h = 0; h < Math.min(rows.length, 15); h++) {
    const header = rows[h].map((c) => clean(c).toLowerCase())
    const index = Object.fromEntries(wanted.map(([k, re]) => [k, header.findIndex((c) => re.test(c))])) as Record<keyof Columns, number>
    if (wanted.some(([k]) => index[k] < 0)) continue
    const out: Notice[] = []
    for (const row of rows.slice(h + 1)) {
      const at = (re: RegExp) => row[header.findIndex((c) => re.test(c))]
      const filer = clean(row[index.filer])
      const noticed = dateOf(row[index.noticed])
      if (!filer || !noticed || !keep(row, at)) continue
      out.push({
        state,
        filer,
        noticed,
        starts: columns.starts ? dateOf(row[index.starts]) : undefined,
        workers: columns.workers ? countOf(row[index.workers]) : undefined,
        place: columns.place ? clean(row[index.place]) || undefined : undefined,
        kind: columns.kind ? clean(row[index.kind]) || undefined : undefined,
      })
    }
    return out
  }
  throw new Error(`The ${state.toUpperCase()} WARN table has changed shape`)
}

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): Row[] {
  const rows: Row[] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f.trim())) rows.push(row.map((f) => f.trim() || undefined))
      row = []
      field = ''
    } else field += ch
  }
  row.push(field)
  if (row.some((f) => f.trim())) rows.push(row.map((f) => f.trim() || undefined))
  return rows
}

/** Every table row's cells, as text. */
export function htmlRows(html: string): Row[] {
  const { document } = parseHTML(html)
  return Array.from(document.querySelectorAll('tr') as ArrayLike<Element>).map((tr) =>
    Array.from(tr.querySelectorAll('th, td') as ArrayLike<Element>).map((c) => clean(c.textContent ?? '') || undefined),
  )
}

/* ---------------------------------------------------------------- fetching */

interface Get {
  method?: 'GET' | 'POST'
  body?: string
  headers?: Record<string, string>
  maxBytes?: number
  timeoutMs?: number
}

/** A state's page or file. States publish from fixed hosts; the address is still checked like any other. */
async function get(url: string, init: Get = {}): Promise<{ bytes: Uint8Array; text: () => string; cookies: string; url: string }> {
  let res: Response
  if (init.method === 'POST') {
    // safeFetch only GETs. A POST goes to a host fixed in this file, so plain fetch is safe here.
    res = await fetch(url, {
      method: 'POST',
      body: init.body,
      headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded', ...init.headers },
      redirect: 'follow',
      signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
    })
    if (!res.ok) throw new Error(`Upstream ${res.status} for ${new URL(url).hostname}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    return { bytes, text: () => new TextDecoder().decode(bytes), cookies: '', url: res.url || url }
  }
  const { res: r, finalUrl } = await safeFetch(url, { headers: init.headers, timeoutMs: init.timeoutMs ?? 20_000 })
  if (!r.ok) {
    void r.body?.cancel().catch(() => {})
    throw new Error(`Upstream ${r.status} for ${new URL(url).hostname}`)
  }
  const bytes = await readLimited(r, init.maxBytes ?? 20_000_000)
  const cookies = (r.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ')
  return { bytes, text: () => new TextDecoder().decode(bytes), cookies, url: finalUrl }
}

/** Links on a page whose address matches, made absolute. */
function linksIn(html: string, base: string, match: RegExp): string[] {
  return [...html.matchAll(/href=["']([^"']+)["']/gi)]
    .map((m) => decodeEntities(m[1]))
    .filter((h) => match.test(h))
    .map((h) => new URL(h, base).toString())
}

/* ---------------------------------------------------------------- the states */

interface State {
  name: string
  /** Where people read the state's notices themselves. */
  page: string
  read(since: string): Promise<Notice[]>
}

const formValue = (html: string, name: string) =>
  decodeEntities(new RegExp(`name="${name}"[^>]*value="([^"]*)"`).exec(html)?.[1] ?? new RegExp(`value="([^"]*)"[^>]*name="${name}"`).exec(html)?.[1] ?? '')

export const STATES: Record<StateCode, State> = {
  ca: {
    name: 'California',
    page: 'https://edd.ca.gov/en/jobs_and_training/Layoff_Services_WARN',
    // The current year's report is a spreadsheet linked from the page; older years are PDFs, out of our window.
    async read() {
      const page = await get(this.page)
      const file = linksIn(page.text(), page.url, /warn[-_]?report[^/]*\.xlsx$/i)[0]
      if (!file) throw new Error('No California WARN report found')
      const sheets = readXlsx((await get(file)).bytes)
      const sheet = sheets.find((s) => /detailed warn report/i.test(s.name)) ?? sheets[0]
      return noticesIn('ca', sheet.rows, { filer: /^company/, noticed: /^notice/, starts: /^effective/, workers: /employees/, place: /^address/, kind: /layoff\/ ?closure/ })
    },
  },
  wa: {
    name: 'Washington',
    page: 'https://esd.wa.gov/about-employees/WARN',
    // A paged ASP.NET table, newest first. Each next page is a postback carrying the last page's view state.
    async read(since) {
      const url = 'https://fortress.wa.gov/esd/file/warn/Public/SearchWARN.aspx'
      let html = (await get(url)).text()
      const out: Notice[] = []
      const columns = { filer: /^company/, noticed: /^received/, starts: /layoff start/, workers: /# of workers/, place: /^location/, kind: /type of layoff|closure/ }
      for (let page = 1; ; page++) {
        const found = noticesIn('wa', htmlRows(html), columns)
        out.push(...found)
        // Newest first: once a page reaches back past the window, the rest are older still. Eleven
        // pages is well past any 120 days Washington has seen.
        if (!found.length || found.some((n) => n.noticed < since) || page === 11) break
        const body = new URLSearchParams({
          __EVENTTARGET: 'ucPSW$gvMain',
          __EVENTARGUMENT: `Page$${page + 1}`,
          __VIEWSTATE: formValue(html, '__VIEWSTATE'),
          __VIEWSTATEGENERATOR: formValue(html, '__VIEWSTATEGENERATOR'),
          __EVENTVALIDATION: formValue(html, '__EVENTVALIDATION'),
        })
        html = (await get(url, { method: 'POST', body: body.toString() })).text()
      }
      return out
    },
  },
  ny: {
    name: 'New York',
    page: 'https://dol.ny.gov/warn-notices',
    // Published through a Tableau dashboard, which serves its data as CSV.
    async read() {
      const csv = (await get('https://public.tableau.com/views/WorkerAdjustmentRetrainingNotificationWARN/WARN.csv?:showVizHome=n')).text()
      return noticesIn('ny', parseCsv(csv), {
        filer: /business legal name|company/,
        noticed: /date of warn notice|notice date/,
        starts: /starts/,
        workers: /number of affected/,
        place: /site address|address/,
        kind: /layoff or closure/,
      })
    },
  },
  tx: {
    name: 'Texas',
    page: 'https://www.twc.texas.gov/data-reports/warn-notice',
    // One spreadsheet per year; this year's, and last year's early in the year.
    async read(since) {
      const page = await get(this.page)
      const files = linksIn(page.text(), page.url, /warn-act-listings-(\d{4})[^/]*\.xlsx$/i).filter((f) => Number(/listings-(\d{4})/.exec(f)?.[1]) >= Number(since.slice(0, 4)))
      if (!files.length) throw new Error('No Texas WARN listing found')
      const sheets = await Promise.all([...new Set(files)].map(async (f) => readXlsx((await get(f)).bytes)[0]))
      return sheets.flatMap((s) => noticesIn('tx', s.rows, { filer: /job_site_name|company/, noticed: /notice_date/, starts: /layoff_date/, workers: /total_layoff/, place: /city_name/ }))
    },
  },
  il: {
    name: 'Illinois',
    page: 'https://dceo.illinois.gov/workforcedevelopment/warn.html',
    // Illinois's export mixes WARN notices with other layoff reports; only the WARN ones count.
    async read() {
      const url =
        'https://apps.illinoisworknet.com/iebs/api/public/export?search=&layoffTypes=&trade=0&dateReportedStart=Invalid%20Date&dateReportedEnd=Invalid%20Date&statuses=4&reasons=&eventCauses=&naicsCodes=1&naicIndustries=&naics=&unionsInvolved=0&geolocation=1&cities=&counties=&lwias=&includeAdditionalLwias=false&edrs=&lat=0&lng=0&distance=.5&memberType=1&users=&accessList=&bookmarked=false'
      // The export is every report Illinois has (it ignores its date filter) and takes about 20 seconds.
      const sheets = readXlsx((await get(url, { timeoutMs: 45_000 })).bytes)
      const sheet = sheets.find((s) => s.name === 'Layoffs') ?? sheets[0]
      return noticesIn(
        'il',
        sheet.rows,
        { filer: /^location name/, noticed: /initial date reported/, workers: /^expected layoff/, place: /^location city/, kind: /^reason/ },
        (_, at) => clean(at(/^warn notice/)).toUpperCase() === 'TRUE',
      )
    },
  },
  nj: {
    name: 'New Jersey',
    page: 'https://www.nj.gov/labor/employer-services/warn/',
    // One workbook with a sheet per year ("2026 WARN Notices"). New Jersey gives only the month a
    // notice was posted, so it counts as posted on the 1st of that month.
    async read() {
      const sheets = readXlsx((await get('https://www.nj.gov/labor/assets/PDFs/WARN/WARN_Notice_Archive.xlsx')).bytes)
      return sheets.slice(0, 2).flatMap((s) => {
        const year = /\b(20\d\d)\b/.exec(s.name)?.[1]
        const posted = s.rows.map((r, i) => {
          if (i === 0 || !year) return r
          const month = MONTHS.indexOf(clean(r[2]).slice(0, 3).toLowerCase()) + 1
          return [r[0], r[1], month ? `${year}-${String(month).padStart(2, '0')}-01` : undefined, r[3], r[4]]
        })
        return noticesIn('nj', posted, { filer: /^company/, noticed: /^month posted/, starts: /^effective date/, workers: /workforce affected/, place: /^city/ })
      })
    },
  },
  ga: {
    name: 'Georgia',
    page: 'https://www.tcsg.edu/warn-public-view/',
    // A WordPress table filled by an AJAX call. The page carries the call's settings (and a nonce);
    // sending them back, sorted newest first, returns the rows.
    async read() {
      const page = await get(this.page)
      const html = page.text()
      const config = jsonObjectAt(html, html.indexOf('"data":{', html.indexOf('"ajax":{"url"')) + 7)
      if (!config) throw new Error('Georgia’s WARN page has changed shape')
      const body = new URLSearchParams()
      const add = (k: string, v: unknown): void => {
        if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) add(`${k}[${kk}]`, vv)
        else body.set(k, v === null || v === undefined ? '' : String(v))
      }
      for (const [k, v] of Object.entries(config)) add(k, v)
      for (const [k, v] of Object.entries({ draw: '1', start: '0', length: '200', 'order[0][column]': '2', 'order[0][dir]': 'desc' })) body.set(k, v)
      for (const [i, name] of ['gv_96', 'gv_4', 'gv_date_created', 'gv_97'].entries()) {
        body.set(`columns[${i}][data]`, String(i))
        body.set(`columns[${i}][name]`, name)
      }
      const res = await get('https://www.tcsg.edu/wp-admin/admin-ajax.php', {
        method: 'POST',
        body: body.toString(),
        headers: { cookie: page.cookies, referer: this.page, 'x-requested-with': 'XMLHttpRequest' },
      })
      const data = JSON.parse(res.text()) as { data?: Record<string, string>[]; error?: string }
      if (!data.data) throw new Error(data.error ?? 'Georgia’s WARN table did not load')
      // Columns: notice id (a link), company, date received, employees affected.
      const rows: Row[] = [['company', 'notice date', 'workers'], ...data.data.map((r) => [clean(r[1]), clean(r[2]), clean(r[3])])]
      return noticesIn('ga', rows, { filer: /^company/, noticed: /^notice date/, workers: /^workers/ })
    },
  },
  or: {
    name: 'Oregon',
    page: 'https://ccwd.hecc.oregon.gov/Layoff/WARN',
    // A form with an anti-forgery token: post it for the latest spreadsheet.
    async read() {
      const start = 'https://ccwd.hecc.oregon.gov/Layoff/WARN/Download'
      const form = await get(start)
      const token = formValue(form.text(), '__RequestVerificationToken')
      if (!token) throw new Error('Oregon’s WARN download page has changed shape')
      const done = await get(start, {
        method: 'POST',
        body: new URLSearchParams({ __RequestVerificationToken: token, WARNFormat: 'xlsx', WARNSort: 'LOT4' }).toString(),
        headers: { cookie: form.cookies, referer: start },
      })
      const file = linksIn(done.text(), start, /\.xlsx|Download\/|GetFile|File/i)[0]
      if (!file) throw new Error('Oregon’s WARN spreadsheet link is missing')
      const sheet = readXlsx((await get(file, { headers: { cookie: form.cookies } })).bytes)[0]
      return noticesIn('or', sheet.rows, { filer: /^company/, noticed: /^received/, starts: /^layoff date/, workers: /laid off/, place: /^location/, kind: /layoff type/ })
    },
  },
  va: {
    name: 'Virginia',
    page: 'https://www.virginiaworks.gov/warn-notices/',
    // The page links a CSV export whose name changes with each update.
    async read() {
      const page = await get(this.page)
      const file = linksIn(page.text(), page.url, /warn_notices[^/]*\.csv/i)[0]
      if (!file) throw new Error('No Virginia WARN export found')
      return noticesIn('va', parseCsv((await get(file)).text()), {
        filer: /^company/,
        noticed: /^notice date/,
        starts: /^impact date/,
        workers: /employees affected/,
        place: /^location/,
        kind: /notice type/,
      })
    },
  },
  md: {
    name: 'Maryland',
    page: 'https://www.dllr.state.md.us/employment/warn.shtml',
    // This year's notices are a table on the page itself.
    async read() {
      const html = (await get(this.page)).text()
      return noticesIn('md', htmlRows(html), { filer: /company/, noticed: /notice date|^date/, workers: /employees|workers|number/, place: /location|address/ })
    },
  },
  ct: {
    name: 'Connecticut',
    page: 'https://dolpublicdocumentlibrary.ct.gov/CsblrCategory?prefix=%2Frapid_response%2Fwarn_documents',
    // A document library with a JSON listing behind it; it wants the cookie its own page sets.
    async read() {
      const first = await get(this.page)
      const json = await get(
        'https://dolpublicdocumentlibrary.ct.gov/CsblrCategory/GetSpecializedData?pageSize=200&pageIndex=1&prefix=%2Frapid_response%2Fwarn_documents&sortedCol=warn_document_date&module=WARN',
        { headers: { cookie: first.cookies, referer: this.page, 'x-requested-with': 'XMLHttpRequest', 'x-security-request': 'required', accept: '*/*' } },
      )
      const items = (JSON.parse(json.text()) as { blobItems?: { blobProperties?: Record<string, string> }[] }).blobItems ?? []
      const rows: Row[] = [
        ['company', 'notice date', 'workers', 'place'],
        ...items.map((i) => {
          const p = i.blobProperties ?? {}
          return [p.affected_company, p.warn_document_received_date ?? p.warn_document_date, p.number_of_impacted_workers, p.layoff_locations]
        }),
      ]
      return noticesIn('ct', rows, { filer: /^company/, noticed: /^notice date/, workers: /^workers/, place: /^place/ })
    },
  },
  az: {
    name: 'Arizona',
    page: 'https://www.azjobconnection.gov/search/warn_lookups/new',
    // A searchable, paged table; searched from the start of the window.
    async read(since) {
      const out: Notice[] = []
      for (let page = 1; page <= 5; page++) {
        const html = (await get(`https://www.azjobconnection.gov/search/warn_lookups?q%5Bnotice_eq%5D=true&q%5Bnotice_on_gteq%5D=${since}&page=${page}`)).text()
        const rows = htmlRows(html)
        // Past the last page; on the first, no table at all is an error page, not an empty list.
        if (rows.length < 2) {
          if (page === 1 && !rows.length) throw new Error('Arizona’s WARN search answered without its table')
          break
        }
        // Arizona's table gives no headcount.
        const found = noticesIn('az', rows, { filer: /^employer/, noticed: /^notice date/, place: /^city/, kind: /warn type/ })
        out.push(...found)
        if (found.length < 10) break
      }
      return out
    },
  },
}

/** The JSON object starting at `at` in a page's script, braces balanced; undefined if it isn't one. */
function jsonObjectAt(html: string, at: number): Record<string, unknown> | undefined {
  if (at < 7 || html[at] !== '{') return undefined
  let depth = 0
  let quoted = false
  for (let i = at; i < Math.min(html.length, at + 20_000); i++) {
    const ch = html[i]
    if (quoted) {
      if (ch === '\\') i++
      else if (ch === '"') quoted = false
    } else if (ch === '"') quoted = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) {
      try {
        return JSON.parse(html.slice(at, i + 1)) as Record<string, unknown>
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

export const isState = (s: string): s is StateCode => Object.hasOwn(STATES, s)

/* ---------------------------------------------------------------- as stories */

/** FNV-1a: a short, stable id for a notice from what it says. */
function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
const dayOf = (isoDay: string) => new Date(`${isoDay}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** A notice from an employer PaperWing follows, as a story. */
export function noticeStory(n: Notice): Story | undefined {
  const employer = employerFiling(n.filer)
  if (!employer) return undefined
  const state = STATES[n.state]
  const closing = /clos/i.test(n.kind ?? '')
  // A city reads well in a headline; a street address ("1655 3rd Street San Francisco CA") or
  // "Statewide" doesn't, so those name the state and keep the address in the details.
  const place = n.place?.replace(/,?\s*\d{5}(-\d{4})?$/, '').trim()
  // A list of sites ("Sumner, Pasco, Bellevue, Redmond, Seattle and Remote") is too long for one, too.
  const where = place && !/^\d/.test(place) && !/statewide/i.test(place) && place.length <= 30 && (place.match(/,| and /g) ?? []).length < 2 ? `${place}, ${state.name}` : state.name
  const title = `${employer.name} gives notice of ${n.workers ? plural(n.workers, 'layoff', 'layoffs') : 'layoffs'} in ${where}${closing ? ', closing the site' : ''}`
  const facts = [
    ['Filed by', n.filer],
    ['Where', n.place ?? state.name],
    ['Workers affected', n.workers ? n.workers.toLocaleString('en-US') : 'Not given'],
    ['Notice received', dayOf(n.noticed)],
    ...(n.starts ? [['Layoffs start', dayOf(n.starts)]] : []),
    ...(n.kind ? [['Type', n.kind]] : []),
  ]
  return {
    key: `wn-${n.state}-${hash([n.filer, n.noticed, n.workers ?? '', n.place ?? ''].join('|'))}`,
    source: 'warn',
    sourceLabel: `${state.name} WARN notices`,
    title,
    url: null,
    discussionUrl: state.page,
    createdAt: Date.parse(`${n.noticed}T12:00:00Z`),
    text:
      `<p>${facts.map(([k, v]) => `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}`).join('<br>')}</p>` +
      `<p>From ${escapeHtml(state.name)}’s WARN notices. Under the WARN Act, employers with 100 or more staff must give 60 days’ notice of a mass layoff or closure.</p>`,
    tags: ['layoffs', 'warn notice', employer.name.toLowerCase()],
    // The agency's own logo.
    site: new URL(state.page).hostname.replace(/^www\./, ''),
    // A filing has nobody discussing it: it opens on its details, not an empty thread.
    hasThread: false,
    // A notice has no votes to go on: it counts by how many people it reaches, from a modest
    // blog post's 40 (rank.ts) up to a busy front-page story's 200 for a thousand or more.
    weight: Math.round(40 + Math.min(160, (n.workers ?? 0) / 6)),
  }
}

/** A notice's key: its state and the hash of what it says (noticeStory). */
export const WARN_KEY = /^wn-([a-z]{2})-([0-9a-z]{1,8})$/

/** A notice that isn't (or is no longer) in its state's list as PaperWing reads it. */
export class NoticeGone extends Error {}

/**
 * What reading a state asks of it beyond one fetch, against the caller's fan-out allowance
 * (api/feed.ts): Washington and Arizona page through results and Oregon takes three steps. The
 * rest are a page and a file at most, and every state's list is shared by all readers through KV.
 */
export const WARN_COST: Partial<Record<StateCode, number>> = { wa: 2, az: 1, or: 1 }

/**
 * One state's notices in the window, cached for everyone: states update a few times a week. A
 * failed read is remembered for ten minutes too, so a state whose page has changed is asked once
 * in that time, not once per reader.
 */
export async function stateNotices(state: StateCode, now = Date.now()): Promise<Notice[]> {
  const since = new Date(now - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
  const failed = `warn:${state}:failed`
  if (kvConfigured()) {
    const reason = await kv()
      .get(failed)
      .catch(() => null)
    if (reason) throw new Error(reason)
  }
  try {
    // Keyed by state alone, and the window applied again on the way out, so the cache doesn't
    // empty for everyone at once when the window moves on at midnight.
    const notices = await cachedInKv(`warn:${state}`, 6 * 3600, async () => (await STATES[state].read(since)).filter((n) => n.noticed >= since))
    return notices.filter((n) => n.noticed >= since)
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'The state’s WARN list could not be read'
    if (kvConfigured())
      await kv()
        .set(failed, reason, 600)
        .catch(() => {})
    throw err
  }
}

/** A state's notices from employers PaperWing follows, newest first, as stories. */
export async function warnStories(state: StateCode, now = Date.now()): Promise<Story[]> {
  const seen = new Set<string>()
  return (await stateNotices(state, now))
    .map(noticeStory)
    .filter((s): s is Story => !!s && !seen.has(s.key) && !!seen.add(s.key))
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** One notice, by its story key, for a link to it: the story and no replies (there's nothing to discuss on a filing). */
export async function warnThread(key: string, now = Date.now()): Promise<Thread> {
  const state = WARN_KEY.exec(key)?.[1] ?? ''
  if (!isState(state)) throw new NoticeGone('Not a WARN notice PaperWing knows')
  const story = (await warnStories(state, now)).find((s) => s.key === key)
  // Not deleted: states keep their lists. It has aged out of the window PaperWing reads, or its details changed.
  if (!story) throw new NoticeGone(`This notice is no longer in the last ${WINDOW_DAYS} days of ${STATES[state].name}’s WARN list that PaperWing reads. The state’s own list has it.`)
  return { story, comments: [] }
}
