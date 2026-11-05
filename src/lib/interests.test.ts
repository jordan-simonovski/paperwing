import { describe, expect, it } from 'vitest'
import { INTEREST_TOPICS } from './interests'
import { matchesTopic, searchTopics, TOPIC_BY_ID, topicsForStory } from './topics'
import { resolveChannel } from './channels'
import { topicIcon } from './topicIcons'
import { Search } from 'lucide-react'

describe('practical interests', () => {
  it.each(['literature', 'reading', 'book reviews'])('finds the existing Books topic through %s', (query) => {
    expect(searchTopics(query).map((hit) => hit.topic.id)).toContain('books')
  })
  it.each([
    ['renewables', 'renewables', 'Rooftop solar and home batteries power a cleaner grid'],
    ['cars', 'classic cars', 'The best cars to buy this year'],
    ['electric-vehicles', 'EVs', 'Electric vehicles and charging stations for regional drivers'],
    ['gardening', 'houseplants', 'Seed sowing in raised beds for new gardeners'],
    ['diy', 'home improvement', 'Home repair tips for leaky taps'],
    ['woodworking', 'carpentry', 'Hand planes for your first woodworking project'],
    ['photography', 'cameras', 'Street photography with mirrorless cameras'],
    ['hiking', 'bushwalking', 'Hiking boots for a first camping trip'],
    ['birding', 'birding', 'Birdwatching and songbirds in your local park'],
    ['tabletop', 'D&D', 'Board games and tabletop RPG adventures for beginners'],
    ['crafts', 'crochet', 'Sewing patterns and knitting for a quiet weekend'],
    ['coffee', 'home barista', 'A guide to espresso and coffee grinders'],
    ['baking', 'bread making', 'Sourdough bread recipes for your first loaf'],
  ])('makes %s searchable, followable and useful for tagging', (id, query, headline) => {
    const topic = TOPIC_BY_ID.get(id)!
    expect(searchTopics(query).map((hit) => hit.topic.id)).toContain(id)
    expect(topicIcon(id)).not.toBe(Search)
    const channel = resolveChannel('for-you', undefined, { followed: [id], interests: [], customFeeds: [] })!
    expect(channel.feeds).toEqual(expect.arrayContaining(topic.feeds))
    expect(topicsForStory({ key: 'test', source: 'rss', sourceLabel: 'Elsewhere', title: headline, url: null, discussionUrl: null, createdAt: 0, hasThread: false })).toContain(id)
  })
  it('keeps broad hobby aliases and programming metaphors out of story tags', () => {
    expect(searchTopics('hobbies').map((hit) => hit.topic.id)).toEqual(expect.arrayContaining(['gardening', 'woodworking', 'photography', 'hiking', 'crafts', 'tabletop']))
    for (const [id, text] of [
      ['crafts', 'Yarn releases a new package manager'],
      ['cars', 'CAR and CDR in Lisp'],
      ['photography', 'Taking a database snapshot'],
      ['hiking', 'The central bank hikes interest rates'],
      ['woodworking', 'Joining tables in SQL'],
    ])
      expect(matchesTopic(TOPIC_BY_ID.get(id)!, text)).toBeUndefined()
    for (const topic of INTEREST_TOPICS) {
      expect(matchesTopic(topic, 'Weekend hobbies are good for you')).toBeUndefined()
      expect(topic.feeds.some((feed) => feed.kind === 'rss')).toBe(true)
    }
  })
})
