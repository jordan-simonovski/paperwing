import { beforeEach, describe, expect, it } from 'vitest'
import { AWAY, capLooks, currentVisit, firstLookThisVisit, look, memoryOf, noteVisibility, resetVisits } from './visits'

const minute = 60_000
const hour = 60 * minute

beforeEach(() => resetVisits(0))

describe('a visit', () => {
  it('is one sitting: coming back after half an hour away starts the next, a quick look away doesn’t', () => {
    expect(currentVisit()).toBe(0)
    noteVisibility('hidden', 10 * minute)
    noteVisibility('visible', 20 * minute)
    expect(currentVisit()).toBe(0)
    noteVisibility('hidden', 30 * minute)
    noteVisibility('visible', 30 * minute + AWAY)
    expect(currentVisit()).toBe(30 * minute + AWAY)
  })

  it('counts a story once a visit, however often it scrolls past', () => {
    expect(firstLookThisVisit('hn-1')).toBe(true)
    expect(firstLookThisVisit('hn-1')).toBe(false)
    noteVisibility('hidden', minute)
    noteVisibility('visible', minute + AWAY)
    expect(firstLookThisVisit('hn-1')).toBe(true)
  })
})

describe('what Hot remembers from earlier visits', () => {
  it('keeps the look before this visit, so this visit’s never sinks a row on screen', () => {
    const first = look(undefined, 12, hour) // visit 0
    resetVisits(5 * hour)
    const second = look(first, 40, 5 * hour)
    expect(second).toEqual({ at: 5 * hour, c: 40, v: 5 * hour, pa: hour, pc: 12 })
    // Looking again in the same visit changes nothing.
    expect(look(second, 55, 5 * hour + minute)).toBe(second)
    // This visit's look is left out: Hot sees one earlier look, at the time and comments it had then.
    expect(memoryOf({ 'hn-1': 2 }, { 'hn-1': second }, {})).toEqual({ 'hn-1': { looks: 1, at: hour, comments: 12 } })
  })

  it('counts an earlier visit’s look, and opening a story then, but nothing from this visit', () => {
    const earlier = look(undefined, 30, hour)
    resetVisits(5 * hour)
    expect(memoryOf({ 'hn-1': 1, 'hn-2': 1 }, { 'hn-1': earlier, 'hn-2': look(undefined, 3, 5 * hour) }, { 'hn-1': 2 * hour, 'hn-3': 5 * hour + minute })).toEqual({
      'hn-1': { looks: 1, at: hour, comments: 30, openedAt: 2 * hour },
    })
  })

  it('remembers a story opened straight from a link, never scrolled past', () => {
    resetVisits(5 * hour)
    expect(memoryOf({}, {}, { 'hn-4': hour })).toEqual({ 'hn-4': { looks: 0, at: hour, openedAt: hour } })
  })
})

describe('how much it keeps', () => {
  it('keeps the most recently seen stories, their counts and looks together', () => {
    const impressions: Record<string, number> = {}
    const glimpses: Record<string, { at: number; v: number }> = {}
    for (let i = 0; i < 12; i++) {
      // The oldest have been seen the most: a cap by count would keep exactly the wrong ones.
      impressions[`k${i}`] = 20 - i
      glimpses[`k${i}`] = { at: i, v: i }
    }
    const kept = capLooks(impressions, glimpses, 10, 8)
    expect(Object.keys(kept.impressions).sort()).toEqual(['k10', 'k11', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9'])
    expect(Object.keys(kept.glimpses).sort()).toEqual(Object.keys(kept.impressions).sort())
    // Under the cap, nothing changes.
    expect(capLooks({ a: 1 }, { a: { at: 1, v: 1 } }, 10, 8).impressions).toEqual({ a: 1 })
  })
})
