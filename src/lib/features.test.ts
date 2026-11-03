import { describe, expect, it } from 'vitest'
import { formatOf, keywords, learn, reasons, rowReason, similarity, storyFeatures, tasteFactor } from './features'
import type { Story } from './types'

const story = (title: string, extra: Partial<Story & { topics: string[] }> = {}): Story & { topics: string[] } => ({
  key: `hn-${title}`,
  source: 'hn',
  sourceLabel: 'Hacker News',
  title,
  url: 'https://example.com/post',
  discussionUrl: null,
  createdAt: 0,
  hasThread: true,
  topics: [],
  ...extra,
})

describe('keywords', () => {
  it('keeps names and terms, drops grammar and filler', () => {
    expect(keywords('Show HN: I built a Kubernetes operator for Postgres backups')).toEqual(['kubernetes', 'operator', 'postgres', 'backup'])
    expect(keywords('GPT-6.1 is out, and it’s faster than C++')).toEqual(['gpt-6.1', 'faster', 'c++'])
  })
})

describe('formatOf', () => {
  it('reads what kind of thing a story is', () => {
    expect(formatOf(story('Attention is all you need', { url: 'https://arxiv.org/abs/1706.03762' }))).toBe('paper')
    expect(formatOf(story('ollama/ollama', { url: 'https://github.com/ollama/ollama' }))).toBe('repo')
    expect(formatOf(story('Show HN: A tiny database'))).toBe('show')
    expect(formatOf(story('Ask HN: How do you do on-call?', { url: null }))).toBe('question')
    expect(formatOf(story('Postmortem: our 6-hour DNS outage'))).toBe('postmortem')
    expect(formatOf(story('How to profile Go services'))).toBe('tutorial')
    expect(formatOf(story('Introducing Grafana 13'))).toBe('launch')
    expect(formatOf(story('Why microservices were a mistake'))).toBe('opinion')
    expect(formatOf(story('Elevated errors', { source: 'status' }))).toBe('incident')
  })
})

describe('taste', () => {
  const k8s = story('Kubernetes operators in production', { topics: ['cloud-native'], url: 'https://kube.dev/a' })
  const k8s2 = story('Debugging Kubernetes networking', { topics: ['cloud-native'], url: 'https://other.dev/b' })
  const crypto = story('Bitcoin hits a new high', { topics: ['industry'], url: 'https://coins.example/x' })

  it('likes what resembles what you voted up, and only that', () => {
    const profile = learn({}, storyFeatures(k8s), 1)
    expect(similarity(storyFeatures(k8s2), profile)).toBeGreaterThan(0.3)
    expect(similarity(storyFeatures(crypto), profile)).toBeLessThan(0.15)
    expect(tasteFactor(storyFeatures(k8s2), profile)).toBeGreaterThan(1.1)
  })
  it('pushes down what resembles what you voted down', () => {
    const profile = learn({}, storyFeatures(crypto), -1)
    expect(tasteFactor(storyFeatures(story('Bitcoin ETF flows slow', { topics: ['industry'], url: 'https://coins.example/y' })), profile)).toBeLessThan(0.9)
  })
  it('takes a vote back exactly', () => {
    expect(learn(learn({}, storyFeatures(k8s), 1), storyFeatures(k8s), -1)).toEqual({})
  })
  it('stays within bounds however much you vote', () => {
    let profile = {}
    for (let i = 0; i < 50; i++) profile = learn(profile, storyFeatures(k8s), 1)
    expect(Math.max(...Object.values(profile as Record<string, number>))).toBeLessThanOrEqual(3)
    expect(tasteFactor(storyFeatures(k8s2), profile)).toBeLessThanOrEqual(2.5)
  })
  it('explains a ranking by its strongest features', () => {
    const profile = learn({}, storyFeatures(k8s), 1)
    expect(reasons(storyFeatures(k8s2), profile)[0].key).toBe('t:cloud-native')
  })
})

describe('the reason a row gives', () => {
  const space = story('Starship reaches orbit on its tenth flight', { topics: ['space'], url: 'https://spacenews.com/starship' })

  it('names what you like when your taste clearly lifted the story', () => {
    let profile = {}
    for (let i = 0; i < 3; i++) profile = learn(profile, storyFeatures(story('Another rocket launch', { topics: ['space'], url: 'https://spacenews.com/a' })), 1.5)
    expect(rowReason(storyFeatures(space), profile)).toMatchObject({ up: true })
  })

  it('names what you voted down when it sank the story', () => {
    const profile = learn({}, storyFeatures(story('Rocket news', { topics: ['space'], url: 'https://spacenews.com/b' })), -4.5)
    expect(rowReason(storyFeatures(space), profile)).toMatchObject({ up: false })
  })

  it('says nothing when taste barely moved it, or there is no taste yet', () => {
    expect(rowReason(storyFeatures(space), {})).toBeUndefined()
    const faint = learn({}, storyFeatures(story('A recipe for bread', { topics: ['food'], url: 'https://food.example/x' })), 0.75)
    expect(rowReason(storyFeatures(space), faint)).toBeUndefined()
  })
})
