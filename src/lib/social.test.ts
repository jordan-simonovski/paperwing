import { describe, expect, it } from 'vitest'
import { boardRecord, canPost, cleanBoard } from './social'

const OWNER = 'did:plc:oooooooooooooooooooooooo'
const MOD = 'did:plc:mmmmmmmmmmmmmmmmmmmmmmmm'
const ANYONE = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'

describe('a board where only moderators post', () => {
  it('survives being saved and read back', () => {
    const saved = cleanBoard(boardRecord({ name: 'Announcements', moderators: [MOD], modsOnly: true }))
    expect(saved).toMatchObject({ name: 'Announcements', moderators: [MOD], modsOnly: true })
    expect(cleanBoard(boardRecord({ name: 'Open', moderators: [] }))?.modsOnly).toBeFalsy()
  })

  it('takes listings from its owner and moderators only; an official board always works this way', () => {
    const closed = cleanBoard(boardRecord({ name: 'Closed', moderators: [MOD], modsOnly: true }))!
    const open = cleanBoard(boardRecord({ name: 'Open', moderators: [MOD] }))!
    expect([OWNER, MOD, ANYONE].map((a) => canPost(closed, OWNER, a))).toEqual([true, true, false])
    expect(canPost(open, OWNER, ANYONE)).toBe(true)
    expect(canPost(open, OWNER, ANYONE, true)).toBe(false)
  })
})
