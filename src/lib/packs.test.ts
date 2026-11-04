import { describe, expect, it } from 'vitest'
import { resolveChannel } from './channels'
import { parseLemmyKey, lemmyKey } from './lemmyKey'
import { CLUSTERS, isTechTopic, matchesTopic, searchTopics, TOPIC_BY_ID, TOPICS, topicsForStory } from './topics'
import type { Story } from './types'

const base = { followed: [] as string[], interests: [], customFeeds: [] }
const story = (title: string): Story => ({ key: 'x', source: 'rss', sourceLabel: 'Somewhere', title, url: null, discussionUrl: null, createdAt: 0, hasThread: false })

describe('sports readers', () => {
  it.each([
    ['climbing', 'Bouldering footwork for your first climbing gym session'],
    ['cricket', 'Australia win the Ashes as the final wicket falls'],
    ['nrl', 'NRLW teams prepare for State of Origin'],
    ['afl', 'AFLW finals head to the MCG'],
    ['rugby-union', 'Wallabies announce squad for the Six Nations warm-up'],
    ['netball', 'Super Netball season opens with a Diamonds reunion'],
    ['american-football', 'NFL draft: a rookie quarterback joins the roster'],
    ['basketball', 'WNBA finals go to a deciding game'],
    ['baseball', 'MLB pitchers prepare for the World Series'],
    ['ice-hockey', 'NHL teams compete for the Stanley Cup'],
    ['tennis', 'Australian Open draw announced by the WTA'],
    ['golf', 'LPGA golfers prepare for the next major'],
    ['cycling', 'Tour de France Femmes heads into the mountains'],
    ['running', 'Your first half marathon: an easy training plan'],
    ['swimming', 'Freestyle swimming drills for beginners'],
    ['surfing', 'World Surf League announces its next tour stop'],
    ['boxing', 'Heavyweight boxing title decided in the final round'],
    ['mma', 'UFC announces a new mixed martial arts champion'],
  ])('opens %s with dedicated sources and tags its stories', (id, headline) => {
    const topic = TOPIC_BY_ID.get(id)!
    expect(topic).toBeDefined()
    expect(topic.cluster).toBe('sport')
    expect(topic.feeds.some((f) => f.kind === 'rss')).toBe(true)
    expect(resolveChannel(id, undefined, base)?.feeds).toEqual(expect.arrayContaining(topic.feeds))
    expect(topicsForStory(story(headline))).toContain(id)
  })
  it('finds regional sports and beginner interests without using aliases as story tags', () => {
    expect(searchTopics('bouldering')[0].topic.id).toBe('climbing')
    expect(searchTopics('climbing for beginners')[0].topic.id).toBe('climbing')
    for (const q of ['Australian sports', 'Aussie sports']) expect(searchTopics(q).map((h) => h.topic.id)).toEqual(expect.arrayContaining(['cricket', 'nrl', 'afl', 'netball']))
    expect(searchTopics('American sports').map((h) => h.topic.id)).toEqual(expect.arrayContaining(['american-football', 'basketball', 'baseball', 'ice-hockey']))
    expect(searchTopics('sports').map((h) => h.topic.id)).toContain('climbing')
    expect(matchesTopic(TOPIC_BY_ID.get('climbing')!, 'Climbing prices push inflation higher')).toBeUndefined()
    expect(matchesTopic(TOPIC_BY_ID.get('running')!, 'Running a database migration in production')).toBeUndefined()
    expect(matchesTopic(TOPIC_BY_ID.get('cycling')!, 'CPU cycling and thread scheduling')).toBeUndefined()
    expect(matchesTopic(TOPIC_BY_ID.get('american-football')!, 'American sports broadcasting rights')).toBeUndefined()
  })
  it('includes practical climbing sources and carries sport into For you', () => {
    expect(TOPIC_BY_ID.get('climbing')!.feeds).toContainEqual(expect.objectContaining({ kind: 'rss', label: 'Climbing Skills' }))
    const feeds = resolveChannel('for-you', undefined, { ...base, followed: ['climbing', 'cricket'] })!.feeds
    expect(feeds).toContainEqual(expect.objectContaining({ kind: 'rss', label: 'Climbing Skills' }))
    expect(feeds.some((f) => f.kind === 'hn')).toBe(false)
  })
})

describe('topic packs', () => {
  it('have unique ids, real neighbours and a pack for every cluster', () => {
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length)
    for (const t of TOPICS) {
      expect(CLUSTERS[t.cluster]).toBeDefined()
      for (const r of t.related) expect(TOPIC_BY_ID.has(r), `${t.id} -> ${r}`).toBe(true)
    }
  })
  it('knows tech from everything else', () => {
    expect(isTechTopic('observability')).toBe(true)
    expect(isTechTopic('politics-au')).toBe(false)
    expect(isTechTopic('q:sourdough')).toBe(false)
  })
  it('tags general stories without stealing tech ones', () => {
    expect(topicsForStory(story('Verstappen takes pole at the Brazilian Grand Prix'))).toContain('motorsport')
    expect(topicsForStory(story('Senate passes the spending bill after a filibuster fight'))).toContain('politics-us')
    expect(matchesTopic(TOPIC_BY_ID.get('gaming')!, 'Building a game engine in Rust')).toBeUndefined()
    expect(matchesTopic(TOPIC_BY_ID.get('space')!, 'Rocket 0.6: a web framework for Rust')).toBeUndefined()
    expect(matchesTopic(TOPIC_BY_ID.get('music')!, 'Single sign-on with SAML')).toBeUndefined()
    expect(matchesTopic(TOPIC_BY_ID.get('books')!, 'A novel approach to garbage collection')).toBeUndefined()
  })
})

describe('science fields, papers and making', () => {
  const at = (title: string, url: string | null = null): Story => ({ ...story(title), url })
  it('finds a paper by where it links, whatever the post says', () => {
    expect(topicsForStory(at('Sleep and the gut, a thread 🧵', 'https://www.biorxiv.org/content/10.1101/2026.10.01.123456v1'))).toContain('papers')
    expect(topicsForStory(at('Results from our run', 'https://arxiv.org/abs/2610.01234'))).toContain('papers')
    expect(topicsForStory(story('Our new preprint: how octopuses sleep'))).toContain('papers')
  })
  it('tags each field and hobby build', () => {
    expect(topicsForStory(story('Physicists confirm a new superconductor at room pressure'))).toContain('physics')
    expect(topicsForStory(story('A volcanic eruption under the ice sheet'))).toContain('earth')
    expect(topicsForStory(story('Ancient DNA rewrites the Bronze Age map of Europe'))).toContain('archaeology')
    expect(topicsForStory(story('I printed a Voron enclosure over the weekend'))).toContain('3d-printing')
    expect(topicsForStory(story('An ESP32 weather station on a hand-soldered PCB'))).toContain('electronics')
  })
  it('leaves tech and business metaphors alone', () => {
    expect(matchesTopic(TOPIC_BY_ID.get('physics')!, 'Writing a physics engine in Rust')).toBeUndefined()
    expect(matchesTopic(TOPIC_BY_ID.get('earth')!, 'A seismic shift in cloud pricing')).toBeUndefined()
    expect(matchesTopic(TOPIC_BY_ID.get('maths')!, 'Choosing a network topology for your cluster')).toBeUndefined()
    expect(matchesTopic(TOPIC_BY_ID.get('chemistry')!, 'Rate cuts are a catalyst for the market')).toBeUndefined()
    expect(matchesTopic(TOPIC_BY_ID.get('ecology')!, 'The JavaScript ecosystem in 2026')).toBeUndefined()
  })
  it('reads where researchers share their papers in For you, and keeps other community feeds to their topic pages', () => {
    const bsky = (followed: string[]) => resolveChannel('for-you', undefined, { ...base, followed })!.feeds.filter((f) => f.kind === 'bskyFeed')
    expect(bsky(['papers'])).toContainEqual(expect.objectContaining({ name: 'Preprint Discourse' }))
    expect(bsky(['papers'])).not.toContainEqual(expect.objectContaining({ name: 'AcademicSky' }))
    expect(bsky(['climate', 'physics'])).toEqual([])
  })
})

describe('For you and Publishers by pack', () => {
  it('keeps Hacker News for tech readers only', () => {
    const hn = (followed: string[]) => resolveChannel('for-you', undefined, { ...base, followed })!.feeds.some((f) => f.kind === 'hn')
    expect(hn([])).toBe(true)
    expect(hn(['ai', 'science'])).toBe(true)
    expect(hn(['science', 'football'])).toBe(false)
  })
  it('gives a non-tech reader their topics’ publishers, not every tech blog', () => {
    const c = resolveChannel('blogs', undefined, { ...base, followed: ['science'] })!
    expect(c.label).toBe('Publishers')
    expect(c.feeds.every((f) => f.kind === 'rss' && TOPIC_BY_ID.get('science')!.feeds.some((g) => g.kind === 'rss' && g.url === f.url))).toBe(true)
  })
  it('puts a topic’s Bluesky feeds and Lemmy instance on its page', () => {
    const c = resolveChannel('climate', undefined, base)!
    expect(c.feeds).toContainEqual(expect.objectContaining({ kind: 'bskyFeed' }))
    expect(c.feeds).toContainEqual(expect.objectContaining({ kind: 'lemmy', community: 'climate@slrpnk.net', via: 'lemmy.world' }))
  })
  it('makes a joined community its own channel', () => {
    const c = resolveChannel('c:world@lemmy.world', 'new', { ...base, communities: [{ name: 'world@lemmy.world', title: 'World News' }] })!
    expect(c.label).toBe('World News')
    expect(c.feeds).toEqual([{ kind: 'lemmy', community: 'world@lemmy.world', sort: 'New', via: 'lemmy.world' }])
    expect(resolveChannel('c:../../etc', undefined, base)).toBeUndefined()
  })
  it('builds an interest from news search too', () => {
    const c = resolveChannel('q:sourdough', undefined, { ...base, interests: [{ id: 'q:sourdough', label: 'sourdough', query: 'sourdough' }] })!
    expect(c.feeds).toContainEqual({ kind: 'news', q: 'sourdough' })
  })
})

describe('Lemmy keys', () => {
  it('keep old programming.dev keys and add the instance otherwise', () => {
    expect(lemmyKey(5)).toBe('lm-5')
    expect(lemmyKey(5, 'lemmy.world')).toBe('lm-5@lemmy.world')
    expect(parseLemmyKey('lm-5')).toEqual({ id: '5', via: 'programming.dev' })
    expect(parseLemmyKey('lm-5@lemmy.world')).toEqual({ id: '5', via: 'lemmy.world' })
  })
  it('never point anywhere else', () => {
    expect(parseLemmyKey('lm-5@169.254.169.254')).toBeUndefined()
    expect(parseLemmyKey('lm-5@evil.example')).toBeUndefined()
    expect(parseLemmyKey('lm-abc')).toBeUndefined()
  })
})
