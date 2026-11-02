import { describe, expect, it } from 'vitest'
import { clusterEvents, words } from './cluster'

const at = Date.now()
const s = (title: string, hoursAgo = 1) => ({ key: title, title, createdAt: at - hoursAgo * 3_600_000 })
// A batch big enough that ordinary words aren't rare, padded with unrelated headlines.
const filler = Array.from({ length: 60 }, (_, i) => s(`Notes on subject${i} and matter${i}`, 2))

function grouped(titles: string[]) {
  const stories = [...titles.map((t) => s(t)), ...filler]
  const groups = clusterEvents(stories, stories.map((_, i) => i))
  return [...groups].map(([l, ms]) => [stories[l].title, ...ms.map((m) => stories[m].title)])
}

describe('words', () => {
  it('marks names in sentence case, but not in Title Case', () => {
    expect(words('Anthropic sued for using 274 Elvis Presley songs').filter((w) => w.entity).map((w) => w.token)).toEqual(['274', 'elvis', 'presley'])
    expect(words('Owners Of Elvis Music Sue Over Copyright').filter((w) => w.entity)).toEqual([])
  })
  it('drops publication credits', () => {
    expect(words('A look at the deal (Jane Doe/New York Times)').map((w) => w.token)).not.toContain('york')
  })
})

describe('clusterEvents', () => {
  it('groups coverage of one event from different outlets', () => {
    const g = grouped(['Owners of Elvis Presley’s Music Sue Anthropic for Copyright Infringement', 'Anthropic sued for allegedly using 274 Elvis Presley songs to train AI models', 'Some other thing entirely'])
    expect(g).toEqual([['Owners of Elvis Presley’s Music Sue Anthropic for Copyright Infringement', 'Anthropic sued for allegedly using 274 Elvis Presley songs to train AI models']])
  })
  it('keeps apart stories that only share ordinary words', () => {
    expect(grouped(['PHP2Shell exploit bypasses protections designed to stop remote code execution', 'Max-severity GitLab bug allows remote code execution over 12 years of releases'])).toEqual([])
    expect(grouped(["India's chip design startups near production with government support", 'Trading firms are investing in AI and chip startups'])).toEqual([])
  })
  it('ignores stories days apart', () => {
    const stories = [s('Python 3.15 released with free threading', 1), s('Python 3.15 free threading benchmarks', 80), ...filler]
    expect(clusterEvents(stories, stories.map((_, i) => i)).size).toBe(0)
  })
})
