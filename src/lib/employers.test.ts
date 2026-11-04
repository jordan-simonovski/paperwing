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
