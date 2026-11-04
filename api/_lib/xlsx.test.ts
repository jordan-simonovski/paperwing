import { describe, expect, it } from 'vitest'
import { workbook } from '../_test/xlsx.js'
import { excelDate, readXlsx } from './xlsx.js'

describe('readXlsx', () => {
  it('reads shared strings, numbers and inline strings, each in its own column', () => {
    const book = workbook(
      {
        'Detailed WARN Report ':
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
          '<row r="2"><c r="A2" t="inlineStr"><is><t>Oracle America, Inc.</t></is></c><c r="B2"><v>46317</v></c><c r="C2"><v>359</v></c></row>',
      },
      ['County', 'No. Of Employees'],
    )
    const [sheet] = readXlsx(book)
    expect(sheet.name).toBe('Detailed WARN Report ')
    expect(sheet.rows).toEqual([
      ['County', undefined, 'No. Of Employees'],
      ['Oracle America, Inc.', 46317, 359],
    ])
  })

  it('decodes entities and joins rich-text runs', () => {
    const [sheet] = readXlsx(workbook({ S: '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' }, ['<r><t xml:space="preserve">AT&amp;T </t></r><r><t>Mobility</t></r>']))
    expect(sheet.rows[0][0]).toBe('AT&T Mobility')
  })

  it('reads elements written with a namespace prefix', () => {
    const [sheet] = readXlsx(workbook({ Layoffs: '<x:row r="1"><x:c r="B1" t="s"><x:v>0</x:v></x:c></x:row>' }, ['Location Name']))
    expect(sheet.rows).toEqual([[undefined, 'Location Name']])
  })

  it('refuses what is not a zip', () => {
    expect(() => readXlsx(new TextEncoder().encode('<html>Not found</html>'))).toThrow('Not an .xlsx file')
  })
})

describe('excelDate', () => {
  it('turns a day number into a date, and refuses numbers that are not dates', () => {
    expect(excelDate(46317)).toBe('2026-10-22')
    expect(excelDate(359)).toBeUndefined()
  })
})
