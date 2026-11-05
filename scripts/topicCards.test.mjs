import { describe, expect, it } from 'vitest'
import { TOPICS } from '../src/lib/topics'
import { createTopicRenderer, CHANNEL_ARTWORK } from './topicCards'
import { topicImagePath } from '../src/lib/topicCard'
import { readFileSync } from 'node:fs'

describe('static topic artwork', () => {
  it('lays out the whole catalogue without clipping and renders real 1200×630 PNGs', () => {
    const render = createTopicRenderer()
    for (const topic of [...TOPICS, ...CHANNEL_ARTWORK]) {
      const svg = render.svg(topic)
      expect(svg).toContain('width="1200" height="630"')
      expect(svg).not.toMatch(/<text\b|https?:\/\/(?!www\.w3\.org)/)
    }
    const topic = TOPICS.find((t) => t.id === 'climbing')
    const png = render.png(topic)
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
    expect(topicImagePath(topic.id)).toBe('/og/topics/climbing.png')
    expect(() => render.svg({ ...topic, label: 'An impossibly long topic name '.repeat(50) })).toThrow(/fit/)
  })
  it('routes topic crawlers before the app fallback and never rewrites missing artwork to HTML', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8'))
    const rule = config.rewrites.find((r) => r.source === '/t/:channel')
    expect(rule.destination).toBe('/api/preview?path=/t/:channel')
    const agents = new RegExp(rule.has.find((h) => h.key === 'user-agent').value)
    for (const agent of ['Twitterbot/1.0', 'facebookexternalhit/1.1', 'Slackbot-LinkExpanding', 'Discordbot/2.0', 'WhatsApp/2.0', 'TelegramBot', 'Bluesky Cardyb', 'LinkedInBot', 'Applebot'])
      expect(agents.test(agent)).toBe(true)
    expect(agents.test('Mozilla/5.0 Safari/605.1.15')).toBe(false)
    const fallback = config.rewrites.find((r) => r.destination === '/index.html')
    expect(config.rewrites.indexOf(rule)).toBeLessThan(config.rewrites.indexOf(fallback))
    expect(new RegExp(`^${fallback.source}$`).test('/og/topics/missing.png')).toBe(false)
    expect(new RegExp(`^${fallback.source}$`).test('/og/channels/missing.png')).toBe(false)
    for (const source of ['/u/:actor', '/c/:did/:rkey', '/mix/:did/:rkey', '/search']) {
      const route = config.rewrites.find((r) => r.source === source)
      expect(route.destination).toBe(`/api/preview?path=${source}`)
      expect(route.has).toEqual(rule.has)
      expect(config.rewrites.indexOf(route)).toBeLessThan(config.rewrites.indexOf(fallback))
    }
  })
})
