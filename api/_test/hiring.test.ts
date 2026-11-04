import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { roleFunction, workdayPosted, type Hiring } from '../_lib/hiring.js'
import { call, fakeUpstreams } from './harness.js'
import { GET, SOURCES } from '../feed.js'

// The Still hiring panel's source: an employer's own job board, read through /api/feed?src=hiring.

const net = fakeUpstreams()
const NOW = Date.parse('2026-11-04T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()
// Only the clock is pinned: "new in the last two weeks" is counted from it.
beforeEach(() => void vi.useFakeTimers({ toFake: ['Date'], now: NOW }))
afterEach(() => void vi.useRealTimers())

const hiringOf = (employer: string) => call<Hiring>(GET, `/api/feed?src=hiring&employer=${encodeURIComponent(employer)}`)

describe('the hiring source', () => {
  it('reads a Greenhouse board by department, counting each role once', async () => {
    const job = (id: number, title: string, published: string) => ({
      id,
      title,
      absolute_url: `https://job-boards.greenhouse.io/dropbox/jobs/${id}`,
      location: { name: 'Remote - US' },
      first_published: published,
    })
    net
      .get('https://boards-api.greenhouse.io')
      .intercept({ path: '/v1/boards/dropbox/departments' })
      .reply(200, {
        departments: [
          { name: 'Engineering', jobs: [job(1, 'Senior Backend Engineer', daysAgo(2)), job(2, 'Staff Software Engineer', daysAgo(40))] },
          { name: 'Go to market', jobs: [job(3, 'Account Executive, Enterprise', daysAgo(5))] },
          // Greenhouse lists a role under each of its departments.
          { name: 'All', jobs: [job(1, 'Senior Backend Engineer', daysAgo(2))] },
        ],
      })
    const res = await hiringOf('Dropbox')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      employer: 'Dropbox',
      board: 'https://job-boards.greenhouse.io/dropbox',
      open: 3,
      functions: [
        ['Engineering', 2],
        ['Sales', 1],
      ],
    })
    expect(res.body.latest.map((r) => r.title)).toEqual(['Senior Backend Engineer', 'Account Executive, Enterprise', 'Staff Software Engineer'])
    expect(res.headers.get('cache-control')).toContain(`s-maxage=${SOURCES.hiring.ttl}`)
  })

  it('reads an Ashby board, marking remote roles', async () => {
    net
      .get('https://api.ashbyhq.com')
      .intercept({ path: '/posting-api/job-board/linear' })
      .reply(200, {
        jobs: [
          { title: 'Senior Product Designer', jobUrl: 'https://jobs.ashbyhq.com/linear/1', location: 'Europe', isRemote: true, department: 'Design', publishedAt: daysAgo(1) },
          { title: 'Unlisted role', jobUrl: 'https://jobs.ashbyhq.com/linear/2', isListed: false },
        ],
      })
    const res = await hiringOf('Linear')
    expect(res.body.open).toBe(1)
    expect(res.body.latest[0]).toMatchObject({ title: 'Senior Product Designer', location: 'Europe, Remote', function: 'Design' })
  })

  it('reads a Lever board', async () => {
    net
      .get('https://api.lever.co')
      .intercept({ path: '/v0/postings/palantir?mode=json' })
      .reply(200, [{ text: 'Forward Deployed Engineer', hostedUrl: 'https://jobs.lever.co/palantir/1', createdAt: NOW - 86_400_000, categories: { location: 'New York, NY', team: 'Dev' } }])
    const res = await hiringOf('Palantir')
    expect(res.body).toMatchObject({ open: 1, fresh: 1, functions: [['Solutions', 1]] })
  })

  it('reads one page of a Workday board: its total and job families, without a "new" count', async () => {
    net
      .get('https://nvidia.wd5.myworkdayjobs.com')
      .intercept({ method: 'POST', path: '/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs' })
      .reply(200, {
        // Workday's total stops at 2,000.
        total: 2000,
        facets: [
          {
            facetParameter: 'jobFamilyGroup',
            values: [
              { descriptor: 'Engineering', count: 1740 },
              { descriptor: 'Sales', count: 321 },
            ],
          },
        ],
        jobPostings: [{ title: 'Senior GPU Architect', externalPath: '/job/US-CA-Santa-Clara/Senior-GPU-Architect_JR1', locationsText: '2 Locations', postedOn: 'Posted Today' }],
      })
    const res = await hiringOf('Nvidia')
    expect(res.body).toMatchObject({
      open: 2061,
      fresh: null,
      functions: [
        ['Engineering', 1740],
        ['Sales', 321],
      ],
    })
    expect(res.body.latest[0]).toMatchObject({ url: 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Senior-GPU-Architect_JR1', location: '' })
  })

  it('gives a Workday board without job families no "new" count either: one page isn’t the board', async () => {
    net
      .get('https://zendesk.wd1.myworkdayjobs.com')
      .intercept({ method: 'POST', path: '/wday/cxs/zendesk/zendesk/jobs' })
      .reply(200, {
        total: 141,
        facets: [],
        jobPostings: [{ title: 'Senior Software Engineer', externalPath: '/job/Remote/Senior-Software-Engineer_R1', locationsText: 'Remote', postedOn: 'Posted Today' }],
      })
    const res = await hiringOf('Zendesk')
    expect(res.body).toMatchObject({ open: 141, fresh: null })
  })

  it('gives no "new" count for a board that re-posts everything at once', async () => {
    const jobs = Array.from({ length: 60 }, (_, i) => ({ id: i, title: `Engineer ${i}`, absolute_url: `https://x.example/${i}`, first_published: daysAgo(3) }))
    net
      .get('https://boards-api.greenhouse.io')
      .intercept({ path: '/v1/boards/carvana/departments' })
      .reply(200, { departments: [{ name: 'Eng', jobs }] })
    const res = await hiringOf('Carvana')
    expect(res.body).toMatchObject({ open: 60, fresh: null })
  })

  it('reads a board once for everyone for a while, however the request is dressed up', async () => {
    process.env.SYNC_MEMORY = '1'
    try {
      net
        .get('https://boards-api.greenhouse.io')
        .intercept({ path: '/v1/boards/dropbox/departments' })
        .reply(200, {
          departments: [{ name: 'Engineering', jobs: [{ id: 1, title: 'Senior Backend Engineer', absolute_url: 'https://job-boards.greenhouse.io/dropbox/jobs/1', first_published: daysAgo(2) }] }],
        })
      expect((await hiringOf('Dropbox')).body.open).toBe(1)
      // Nothing else is faked: a second read of the board would fail the test.
      const again = await call<Hiring>(GET, '/api/feed?src=hiring&employer=Dropbox&cachebust=1')
      expect(again.body.open).toBe(1)
    } finally {
      delete process.env.SYNC_MEMORY
    }
  })

  it('remembers a board it couldn’t read for a while, rather than asking it again for every reader', async () => {
    process.env.SYNC_MEMORY = '1'
    try {
      net.get('https://boards-api.greenhouse.io').intercept({ path: '/v1/boards/figma/departments' }).reply(503, 'busy')
      expect((await hiringOf('Figma')).status).toBe(502)
      // Nothing else is faked: a second read of the board would fail the test.
      expect((await call(GET, '/api/feed?src=hiring&employer=Figma&again=1')).status).toBe(502)
    } finally {
      delete process.env.SYNC_MEMORY
    }
  })

  it('refuses a name that is not an employer PaperWing follows, without fetching anything', async () => {
    const res = await hiringOf('Evil Corp')
    expect(res.status).toBe(400)
    const noBoard = await hiringOf('Google')
    expect(noBoard.status).toBe(400)
  })

  it('says so when the board is down', async () => {
    net.get('https://boards-api.greenhouse.io').intercept({ path: '/v1/boards/figma/departments' }).reply(503, 'busy')
    expect((await hiringOf('Figma')).status).toBe(502)
  })
})

describe('roleFunction', () => {
  it('reads the kind of work from the title first', () => {
    expect(roleFunction('Senior Sales Engineer')).toBe('Solutions')
    expect(roleFunction('Machine Learning Engineer')).toBe('Data and ML')
    expect(roleFunction('Staff Software Engineer, Payments')).toBe('Engineering')
    expect(roleFunction('Administrative Business Partner')).toBe('People, finance and legal')
    expect(roleFunction('Account Executive, Enterprise')).toBe('Sales')
  })

  it('falls back to the department, then to Other', () => {
    expect(roleFunction('Wizard', 'Engineering')).toBe('Engineering')
    expect(roleFunction('Wizard')).toBe('Other')
  })
})

describe('workdayPosted', () => {
  it('turns Workday’s relative dates into days', () => {
    expect(workdayPosted('Posted Today', NOW)).toBe('2026-11-04')
    expect(workdayPosted('Posted Yesterday', NOW)).toBe('2026-11-03')
    expect(workdayPosted('Posted 30+ Days Ago', NOW)).toBe('2026-10-05')
    expect(workdayPosted('soon', NOW)).toBeUndefined()
  })
})
