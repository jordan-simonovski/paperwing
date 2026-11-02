import { describe, expect, it } from 'vitest'
import { detectOutages, matchProviders } from './outages'

const names = (t: string) => matchProviders(t).map((p) => p.name)

describe('matchProviders', () => {
  it('needs the provider and a complaint in the same sentence', () => {
    expect(names('GitHub is down again, cannot push anything')).toEqual(['GitHub'])
    expect(names('Cloudflare outage taking half the internet with it')).toEqual(['Cloudflare'])
    expect(names('Is ChatGPT not loading for anyone else?')).toEqual(['OpenAI'])
    expect(names('I use GitHub every day. My mood is down today.')).toEqual([])
  })
  it('ignores handles, links, markets and status bots', () => {
    expect(names('You lift my heart up when the rest of me is down @someone.bsky.social')).toEqual([])
    expect(names('The Dow is down 600 points and AWS stock fell')).toEqual([])
    expect(names('🔴 GitHub is reporting a major outage')).toEqual([])
  })
})

describe('detectOutages', () => {
  const now = Date.parse('2026-10-26T12:00:00Z')
  const m = (author: string, minutesAgo: number, text = 'GitHub is down for me') => ({ author, at: now - minutesAgo * 60_000, text, url: `https://x/${author}` })

  it('flags a jump in distinct people, not a steady trickle', () => {
    const burst = [...Array.from({ length: 8 }, (_, i) => m(`a${i}`, 5 + i)), m('a0', 6), m('old1', 60)]
    expect(detectOutages(burst, now)[0]).toMatchObject({ name: 'GitHub', recent: 8, level: 'spike' })
    const steady = Array.from({ length: 24 }, (_, i) => m(`s${i}`, i * 5))
    expect(detectOutages(steady, now)[0].level).toBe('chatter')
  })
})
