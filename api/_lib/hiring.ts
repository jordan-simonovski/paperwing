import { employerByName, type Employer, type JobBoard } from '../../src/lib/employers.js'
import type { Hiring, Opening } from '../../src/lib/hiringTypes.js'
import { fetchJson, UA } from './http.js'
import { cachedOrFailed } from './kv.js'

export type { Hiring, Opening }

// What an employer is hiring for, from its own job board: the Still hiring panel beside a layoff
// story. Greenhouse, Ashby and Lever publish open JSON APIs. Workday has none, so this reads the
// JSON its own career pages use, which can change without notice. Boards come from EMPLOYERS only,
// by slug or tenant, so every host here is fixed in code.

/* ------------------------------------------------------------ classifying */

// First match wins, so "Sales Engineer" is Solutions, not Engineering.
const FUNCTIONS: [string, RegExp][] = (
  [
    [
      'Solutions',
      /sales engineer|solutions? (engineer|architect|consultant)|forward deployed|customer engineer|field engineer|technical account|pre-?sales|implementation (engineer|consultant)|consultant|professional services/,
    ],
    [
      'Data and ML',
      /machine learning|\bml\b|\bmle\b|data scien|data engineer|analytics engineer|research (scientist|engineer)|applied scientist|\bai (engineer|researcher|scientist)|data analyst|deep learning|\bllm\b|computer vision/,
    ],
    ['Security', /security|\bsecops\b|threat|detection (engineer|response)|penetration|appsec/],
    ['Engineering', /engineer|developer|\bsre\b|devops|architect|programmer|technical staff|\bswe\b|firmware|\bqa\b|quality assurance|tech lead/],
    ['Product', /product (manager|lead|owner|management|director|operations)|\bpm\b|program|project (manager|lead)|\btpm\b/],
    ['Design', /design|\bux\b|\bui\b|user research|creative|illustrat|artist|animator/],
    ['Sales', /account (executive|manager|director)|sales|seller|\bsdr\b|\bbdr\b|business development|partnerships?|partner (manager|development|success)|revenue|deal desk|broker|channel/],
    ['Marketing', /marketing|growth|content|communications|\bcomms\b|\bpr\b|social media|events|brand|copywriter|community/],
    ['Support', /support|customer (success|experience|service|operations)|onboarding|claims|trust (&|and) safety|investigator/],
    [
      'Operations',
      /operations|logistics|supply chain|manufactur|technician|mechanic|warehouse|facilities|production|assembl|strategy|sourcing|supplier|planning|business analyst|\bops\b|construction/,
    ],
    [
      'People, finance and legal',
      /financ|accountant|accounting|\btax\b|treasury|fp&a|payroll|legal|counsel|attorney|paralegal|compliance|recruit|talent|people|\bhr\b|human resources|workplace|assistant|administrative|business partner|procurement|audit|policy/,
    ],
  ] as const
).map(([name, re]) => [name, new RegExp(re.source, 'i')])

/** What kind of work a role is, from its title, else its department. */
export function roleFunction(title: string, department = ''): string {
  for (const text of [title, department]) {
    if (!text) continue
    const hit = FUNCTIONS.find(([, re]) => re.test(text))
    if (hit) return hit[0]
  }
  return 'Other'
}

/* ------------------------------------------------------------ the boards */

interface Read {
  roles: Opening[]
  /** Workday says how many there are and groups them by job family without our reading them all. */
  total?: number
  families?: [string, number][]
}

// Ashby and Lever always send every role's full description: OpenAI's board is 13 MB.
const BIG_BOARD = 40_000_000
const getJson = <T>(url: string): Promise<T> => fetchJson<T>(url, { maxBytes: BIG_BOARD, timeoutMs: 15_000 })

const role = (title: string, url: string, location: string, department: string, postedAt?: string): Opening => ({
  title: title.replace(/\s+/g, ' ').trim(),
  url,
  location: location.replace(/\s+/g, ' ').trim(),
  function: roleFunction(title, department),
  postedAt: postedAt?.slice(0, 10),
})

interface GreenhouseDepartments {
  departments: { name: string; jobs: { id: number; title: string; absolute_url: string; location?: { name?: string }; first_published?: string }[] }[]
}
async function greenhouse(slug: string): Promise<Read> {
  // Departments carry their jobs: one request gives both.
  const data = await getJson<GreenhouseDepartments>(`https://boards-api.greenhouse.io/v1/boards/${slug}/departments`)
  const seen = new Set<number>()
  const roles: Opening[] = []
  for (const d of data.departments)
    for (const j of d.jobs) {
      if (seen.has(j.id)) continue
      seen.add(j.id)
      roles.push(role(j.title, j.absolute_url, j.location?.name ?? '', d.name, j.first_published))
    }
  return { roles }
}

interface AshbyBoard {
  jobs: { title: string; jobUrl: string; location?: string; isRemote?: boolean; department?: string; team?: string; publishedAt?: string; isListed?: boolean }[]
}
async function ashby(slug: string): Promise<Read> {
  const data = await getJson<AshbyBoard>(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)
  return {
    roles: data.jobs
      .filter((j) => j.isListed !== false)
      .map((j) => role(j.title, j.jobUrl, [j.location, j.isRemote && !/remote/i.test(j.location ?? '') ? 'Remote' : ''].filter(Boolean).join(', '), j.department ?? j.team ?? '', j.publishedAt)),
  }
}

interface LeverPosting {
  text: string
  hostedUrl: string
  createdAt?: number
  workplaceType?: string
  categories?: { location?: string; department?: string; team?: string }
}
async function lever(slug: string): Promise<Read> {
  const data = await getJson<LeverPosting[]>(`https://api.lever.co/v0/postings/${slug}?mode=json`)
  return {
    roles: data.map((j) => {
      const loc = j.categories?.location ?? ''
      const remote = j.workplaceType === 'remote' && !/remote/i.test(loc) ? 'Remote' : ''
      return role(j.text, j.hostedUrl, [loc, remote].filter(Boolean).join(', '), j.categories?.department ?? j.categories?.team ?? '', j.createdAt ? new Date(j.createdAt).toISOString() : undefined)
    }),
  }
}

interface WorkdayPage {
  total?: number
  jobPostings?: { title?: string; externalPath?: string; locationsText?: string; postedOn?: string }[]
  facets?: { facetParameter?: string; descriptor?: string; values?: { descriptor?: string; count?: number }[] }[]
}

const workdayHost = (b: Extract<JobBoard, { ats: 'workday' }>) => `https://${b.tenant}.wd${b.wd}.myworkdayjobs.com`

/** "Posted Today", "Posted 3 Days Ago", "Posted 30+ Days Ago" as a date. */
export function workdayPosted(text: string | undefined, now: number): string | undefined {
  const m = /Posted (Today|Yesterday|(\d+)\+? Days Ago)/.exec(text ?? '')
  if (!m) return undefined
  const days = m[1] === 'Today' ? 0 : m[1] === 'Yesterday' ? 1 : Number(m[2])
  return new Date(now - days * 86_400_000).toISOString().slice(0, 10)
}

async function workday(b: Extract<JobBoard, { ats: 'workday' }>, now: number): Promise<Read> {
  // One page is enough: it carries the total, a job-family count for every role, and the newest postings.
  const res = await fetch(`${workdayHost(b)}/wday/cxs/${b.tenant}/${b.site}/jobs`, {
    method: 'POST',
    headers: { 'user-agent': UA, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: '' }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Upstream ${res.status} for ${b.tenant}.myworkdayjobs.com`)
  const page = (await res.json()) as WorkdayPage
  const family = page.facets?.find((f) => /job ?family|jobFamily/i.test(`${f.facetParameter} ${f.descriptor}`))
  const families = family?.values?.filter((v) => v.descriptor && v.count).map((v): [string, number] => [v.descriptor!, v.count!])
  // Workday's total stops at 2,000; every role is in exactly one job family, so their sum is the real count.
  const total = Math.max(page.total ?? 0, families?.reduce((n, [, c]) => n + c, 0) ?? 0)
  return {
    total,
    families,
    roles: (page.jobPostings ?? [])
      .filter((j) => j.title && j.externalPath)
      .map((j) => role(j.title!, `${workdayHost(b)}/${b.site}${j.externalPath}`, /^\d+ Locations$/.test(j.locationsText ?? '') ? '' : (j.locationsText ?? ''), '', workdayPosted(j.postedOn, now))),
  }
}

export function boardUrl(b: JobBoard): string {
  switch (b.ats) {
    case 'greenhouse':
      return `https://job-boards.greenhouse.io/${b.slug}`
    case 'ashby':
      return `https://jobs.ashbyhq.com/${b.slug}`
    case 'lever':
      return `https://jobs.lever.co/${b.slug}`
    case 'workday':
      return `${workdayHost(b)}/${b.site}`
  }
}

function read(b: JobBoard, now: number): Promise<Read> {
  switch (b.ats) {
    case 'greenhouse':
      return greenhouse(b.slug)
    case 'ashby':
      return ashby(b.slug)
    case 'lever':
      return lever(b.slug)
    case 'workday':
      return workday(b, now)
  }
}

/* ------------------------------------------------------------ the answer */

const FRESH_DAYS = 14
const LATEST = 6

/**
 * Openings for one of EMPLOYERS, by name. Undefined for a name that isn't one, or has no board.
 * Each board is read once for everyone every six hours, and a board that can't be read is left alone
 * for ten minutes: some are tens of megabytes, and one fetch never counts against a reader's fan-out
 * allowance, so the cache is what keeps it to one.
 */
export async function hiring(name: string, now = Date.now()): Promise<Hiring | undefined> {
  const employer: Employer | undefined = employerByName(name)
  if (!employer?.board) return undefined
  const board = employer.board
  return cachedOrFailed(`hiring:${employer.name}`, 6 * 3600, 600, () => summarise(employer, board, now))
}

async function summarise(employer: Employer, board: JobBoard, now: number): Promise<Hiring> {
  const { roles, total, families } = await read(board, now)
  const open = total ?? roles.length

  const counts = new Map<string, number>()
  if (families?.length) for (const [family, n] of families) counts.set(roleFunction(family), (counts.get(roleFunction(family)) ?? 0) + n)
  else for (const r of roles) counts.set(r.function, (counts.get(r.function) ?? 0) + 1)

  // Some boards re-post every role every few days (Nvidia: 1,500 "posted 4 days ago"). When most of a
  // big board claims to be new, its dates say nothing, so no "new" count is better than a wrong one.
  const cutoff = new Date(now - FRESH_DAYS * 86_400_000).toISOString().slice(0, 10)
  const recent = roles.filter((r) => r.postedAt && r.postedAt >= cutoff).length
  // Workday shows only its newest page here, so it never gets a count either, family facet or not.
  const reposts = roles.length >= 50 && recent / roles.length > 0.4
  const fresh = board.ats === 'workday' || reposts ? null : recent

  return {
    employer: employer.name,
    board: boardUrl(board),
    open,
    fresh,
    functions: [...counts].sort((a, b) => b[1] - a[1]),
    latest: [...roles].sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? '')).slice(0, LATEST),
  }
}
