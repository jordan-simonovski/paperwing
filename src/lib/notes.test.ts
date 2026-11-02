import { describe, expect, it } from 'vitest'
import { locateQuote } from './notes'

describe('locateQuote', () => {
  it('finds a passage across text pieces and line breaks', () => {
    const pieces = ['The open web was\n   meant to be ', 'something', ' else.', 'Second para.']
    expect(locateQuote(pieces, 'meant to be something else')).toEqual({ start: [0, 20], end: [2, 5] })
    const spot = locateQuote(pieces, 'meant to be something else')!
    expect(pieces[spot.start[0]].slice(spot.start[1]) + pieces[1] + pieces[2].slice(0, spot.end[1])).toBe('meant to be something else')
    expect(locateQuote(pieces, 'not in the article')).toBeUndefined()
  })
})
