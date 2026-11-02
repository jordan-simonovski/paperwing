import { describe, expect, it } from 'vitest'
import { locateQuote, offerSpot } from './notes'

describe('locateQuote', () => {
  it('finds a passage across text pieces and line breaks', () => {
    const pieces = ['The open web was\n   meant to be ', 'something', ' else.', 'Second para.']
    expect(locateQuote(pieces, 'meant to be something else')).toEqual({ start: [0, 20], end: [2, 5] })
    const spot = locateQuote(pieces, 'meant to be something else')!
    expect(pieces[spot.start[0]].slice(spot.start[1]) + pieces[1] + pieces[2].slice(0, spot.end[1])).toBe('meant to be something else')
    expect(locateQuote(pieces, 'not in the article')).toBeUndefined()
  })
})

describe('where the note offer sits', () => {
  const viewport = { width: 1440, height: 900 }
  it('floats just above the selected passage, centred on it', () => {
    expect(offerSpot({ top: 400, bottom: 440, left: 900, right: 1300 }, viewport)).toEqual({ top: 352, left: 1100 })
  })
  it('drops below a passage at the very top of the window, so it never leaves the screen', () => {
    expect(offerSpot({ top: 20, bottom: 60, left: 900, right: 1000 }, viewport).top).toBe(68)
  })
  it('stays inside the window at either edge', () => {
    expect(offerSpot({ top: 400, bottom: 420, left: 1400, right: 1440 }, viewport).left).toBe(1440 - 110)
    expect(offerSpot({ top: 400, bottom: 420, left: 0, right: 20 }, viewport).left).toBe(110)
  })
})
