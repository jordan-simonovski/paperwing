import { describe, expect, it } from 'vitest'
import { EMPLOYERS, employerByName, employerFiling, employersIn, hiringEmployer, legalName } from './employers'

const names = (list: { name: string }[]) => list.map((e) => e.name)

describe('legalName', () => {
  it('drops punctuation and legal suffixes', () => {
    expect(legalName('Amazon.com Services, LLC')).toBe('amazon com services')
    expect(legalName('The Walt Disney Company')).toBe('walt disney')
    expect(legalName('Meta Platforms, Inc.')).toBe('meta platforms')
  })
})

describe('employerFiling', () => {
  it('matches a filer to the employer behind it, site names and all', () => {
    expect(employerFiling('Amazon.com Services LLC')?.name).toBe('Amazon')
    expect(employerFiling('Amazon - SJC13')?.name).toBe('Amazon')
    expect(employerFiling('Intel Corporation - SC-12')?.name).toBe('Intel')
    expect(employerFiling('Meta Platforms, Inc.')?.name).toBe('Meta')
    expect(employerFiling('Uber Technologies, Inc. (1655 3rd Street)')?.name).toBe('Uber')
  })

  it('needs an exact name for employers called by an everyday word', () => {
    expect(employerFiling('Block, Inc.')?.name).toBe('Block')
    expect(employerFiling('Block Builders LLC')).toBeUndefined()
    expect(employerFiling('Meta Materials Inc')).toBeUndefined()
    expect(employerFiling('Compass Group USA')).toBeUndefined()
  })

  it('does not match one word inside another', () => {
    expect(employerFiling('Intelligent Systems Corp')).toBeUndefined()
    expect(employerFiling('Applebee’s Restaurants LLC')).toBeUndefined()
  })
})

describe('employersIn', () => {
  it('finds employers named in a headline', () => {
    expect(names(employersIn('Amazon cuts 14,000 corporate jobs'))).toEqual(['Amazon'])
    expect(names(employersIn('Netflix to lay off roughly 1,000 employees'))).toEqual(['Netflix'])
  })

  it('counts an everyday-word name only when the headline says that company is cutting', () => {
    expect(names(employersIn('Block lays off nearly 1,000 employees'))).toEqual(['Block'])
    expect(names(employersIn('Linear’s layoffs hit design'))).toEqual(['Linear'])
    expect(employersIn('A block of layoffs hit the Bay Area')).toEqual([])
    expect(employersIn('Linear growth in layoffs this year')).toEqual([])
  })

  it('ignores names inside links and handles', () => {
    expect(employersIn('posted on amazon.com/jobs')).toEqual([])
    expect(employersIn('via @netflix')).toEqual([])
  })
})

describe('hiringEmployer', () => {
  it('names the one employer a layoff story is about, when its openings can be read', () => {
    expect(hiringEmployer('Dropbox is laying off roughly 9% of its workforce')?.name).toBe('Dropbox')
    expect(hiringEmployer('Salesforce cuts 1,000 jobs')?.name).toBe('Salesforce')
  })

  it('stays quiet for stories that are not about layoffs', () => {
    expect(hiringEmployer('Dropbox launches a new AI search')).toBeUndefined()
  })

  it('stays quiet when the employer has no board, or the headline names two', () => {
    expect(hiringEmployer('Google lays off hundreds in its cloud unit')).toBeUndefined()
    expect(hiringEmployer('Adobe rival Canva lays off 22% of staff')).toBeUndefined()
  })
})

describe('the list', () => {
  it('has one entry per name, each findable by it', () => {
    const seen = new Set<string>()
    for (const e of EMPLOYERS) {
      expect(seen.has(e.name)).toBe(false)
      seen.add(e.name)
      expect(employerByName(e.name)).toBe(e)
    }
  })

  it('only names job boards by slug or Workday tenant, never by address', () => {
    for (const e of EMPLOYERS) {
      if (!e.board) continue
      if (e.board.ats === 'workday') {
        expect(e.board.tenant).toMatch(/^[a-z0-9-]+$/)
        expect(e.board.site).toMatch(/^[A-Za-z0-9_-]+$/)
      } else expect(e.board.slug).toMatch(/^[a-z0-9.-]+$/)
    }
  })
})

describe('employerFiling with everyday-word names', () => {
  it('still matches a filing that keeps its legal suffix before the site', () => {
    expect(employerFiling('Apple, Inc. - Cupertino')?.name).toBe('Apple')
    expect(employerFiling('Apple Valley Hospital')).toBeUndefined()
  })
})

describe('employerFiling with short or shared names', () => {
  // Each of these is a real filer on a state's WARN list, and none is the employer whose name it starts with.
  it('does not take a different company for one whose name starts the same way', () => {
    expect(employerFiling('X-Energy, LLC')).toBeUndefined()
    expect(employerFiling('EA Engineering, Science, and Technology, Inc., PBC')).toBeUndefined()
    expect(employerFiling('HP Hood LLC')).toBeUndefined()
    expect(employerFiling("Dell Children's Medical Center")).toBeUndefined()
    expect(employerFiling('Oracle Elevator Company')).toBeUndefined()
    expect(employerFiling('Indeed Brewing Company')).toBeUndefined()
  })

  it('still matches those employers’ own filings', () => {
    expect(employerFiling('HP Inc.')?.name).toBe('HP')
    expect(employerFiling('HP Inc. - Palo Alto')?.name).toBe('HP')
    expect(employerFiling('Dell Technologies')?.name).toBe('Dell')
    expect(employerFiling('Oracle America, Inc.')?.name).toBe('Oracle')
    expect(employerFiling('Oracle America, Inc. - Redwood City')?.name).toBe('Oracle')
    expect(employerFiling('X Corp')?.name).toBe('Twitter/X')
    expect(employerFiling('Electronic Arts Inc.')?.name).toBe('Electronic Arts')
  })
})

describe('hiringEmployer on WARN notices', () => {
  it('reads the employer from a notice’s title, everyday-word names included', () => {
    expect(hiringEmployer('Lyft gives notice of 120 layoffs in San Francisco, California')?.name).toBe('Lyft')
    expect(hiringEmployer('Dropbox gives notice of 57 layoffs in California')?.name).toBe('Dropbox')
  })
})

describe('employerFiling with a site after a dash', () => {
  it('matches a short name that a filing follows with " - <site>"', () => {
    expect(employerFiling('IBM - Research Triangle Park')?.name).toBe('IBM')
    expect(employerFiling('AMD – Austin')?.name).toBe('AMD')
  })

  it('leaves everyday-word names out of it: "Mercury - Lansing" could be anyone', () => {
    expect(employerFiling('Mercury - Lansing')).toBeUndefined()
    expect(employerFiling('Compass - Dallas Distribution Center')).toBeUndefined()
  })

  it('matches Dell by the names it files under', () => {
    expect(employerFiling('Dell Marketing L.P.')?.name).toBe('Dell')
    expect(employerFiling('Dell Products L.P. - Round Rock')?.name).toBe('Dell')
  })

  it('still keeps out other companies whose names start the same way', () => {
    expect(employerFiling('HP Hood LLC - Winchester')).toBeUndefined()
    expect(employerFiling('X-Energy, LLC')).toBeUndefined()
  })
})
