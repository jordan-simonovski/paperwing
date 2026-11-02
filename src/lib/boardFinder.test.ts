import { describe, expect, it } from 'vitest'
import { activityLabel, boardsAbout, byActivity, findBoards, officialFrom, tidTime } from './boardFinder'
import { tid } from './mixes'
import { TOPIC_BY_ID } from './topics'

const board = (name: string, extra: Record<string, unknown> = {}) => ({
  uri: `at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/io.paperwing.board/${name.length.toString().padStart(13, 'a')}`,
  name,
  owner: 'did:plc:o',
  moderators: [],
  createdAt: '2026-10-01T00:00:00Z',
  ...extra,
})

describe('a record key’s time', () => {
  it('reads back the moment a key was made', () => {
    const at = Date.UTC(2026, 10, 2, 12)
    expect(Math.abs(tidTime(tid(at * 1000))! - at)).toBeLessThan(2)
  })
  it('has none for something that isn’t a key', () => {
    expect(tidTime('not-a-tid')).toBeUndefined()
    expect(tidTime('self')).toBeUndefined()
  })
})

describe('finding boards', () => {
  const boards = [board('Home Cooking', { description: 'Recipes and kitchen gear' }), board('Sourdough', { description: 'Bread, starters and home baking' }), board('Kites')]

  it('by words in the name first, then the description', () => {
    expect(findBoards(boards, 'sour').map((b) => b.name)).toEqual(['Sourdough'])
    expect(findBoards(boards, 'home').map((b) => b.name)).toEqual(['Home Cooking', 'Sourdough'])
    expect(findBoards(boards, 'kitchen gear').map((b) => b.name)).toEqual(['Home Cooking'])
    expect(findBoards(boards, '')).toEqual([])
  })

  it('about a topic: the one its owner chose, or what its name and description say', () => {
    const science = TOPIC_BY_ID.get('science')!
    const space = TOPIC_BY_ID.get('space')!
    const list = [board('Lab notes', { topic: 'science' }), board('Rockets', { description: 'Launches, NASA and SpaceX' }), board('Kites')]
    expect(boardsAbout(list, science).map((b) => b.name)).toEqual(['Lab notes'])
    expect(boardsAbout(list, space).map((b) => b.name)).toEqual(['Rockets'])
  })

  it('busiest first, then newest; official ones above the rest', () => {
    const list = [
      board('Quiet', { active: 0, createdAt: '2026-10-05T00:00:00Z' }),
      board('Busy', { active: 9 }),
      board('Newer quiet', { active: 0, createdAt: '2026-10-09T00:00:00Z' }),
      board('Announcements', { active: 1, official: true }),
    ]
    expect(byActivity(list).map((b) => b.name)).toEqual(['Announcements', 'Busy', 'Newer quiet', 'Quiet'])
  })

  it('says how lively a board is in a few words', () => {
    expect(activityLabel(0)).toBe('Quiet this week')
    expect(activityLabel(1)).toBe('1 link this week')
    expect(activityLabel(12)).toBe('12 links this week')
  })
})

describe('official boards', () => {
  it('are owned by an account the deployment names (PAPERWING_OFFICIAL), whatever a board calls itself', () => {
    const official = officialFrom('did:plc:eprq6bm2okrgk6zsoka2wpux, did:plc:secondadminxxxxxxxxxxxxx\nnot-a-did')
    expect(official('did:plc:eprq6bm2okrgk6zsoka2wpux')).toBe(true)
    expect(official('did:plc:secondadminxxxxxxxxxxxxx')).toBe(true)
    expect(official('did:plc:someoneelseentirelyxxxxx')).toBe(false)
  })
  it('with none named, no board is official', () => {
    expect(officialFrom('')('did:plc:eprq6bm2okrgk6zsoka2wpux')).toBe(false)
  })
})
