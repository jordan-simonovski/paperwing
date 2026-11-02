import { describe, expect, it } from 'vitest'
import { BSKY_FEED_BY_RKEY, searchQueries } from '../../src/lib/bskyFeeds'
import { keep, rank, type PostView } from './bsky'

let n = 0
const post = (text: string, extra: Partial<PostView> = {}): PostView => ({
  uri: `at://did:plc:test${n}/app.bsky.feed.post/${n++}`,
  cid: 'c',
  author: { did: `did:plc:author${n}`, handle: `person${n}.bsky.social` },
  record: { text, createdAt: new Date(Date.now() - 3_600_000).toISOString(), langs: ['en'] },
  likeCount: 10,
  indexedAt: new Date(Date.now() - 3_600_000).toISOString(),
  ...extra,
})
const feed = (rkey: string) => BSKY_FEED_BY_RKEY.get(rkey)!

describe('bluesky feed filters', () => {
  // Each of these got into a feed before the terms were tightened.
  it.each([
    ['distributed', 'Carly Rae Jepsen - Call Me Maybe'],
    ['web', 'Brazil Fans React to David Luiz Goal at 2014 World Cup'],
    ['ai-infra', 'Was restocking some filament and decided to get some TPU'],
    ['hardware', 'Snapdragon in the rain'],
    ['languages', 'i once inherited a webservice written by Mr Haskell'],
    ['sre', 'Please Advise! An election post-mortem: how did he win so big?'],
    ['observability', 'A new Alien film: Prometheus returns'],
    ['observability', '⚠️ Grafana Cloud is reporting an incident: ingestion errors in mimir-prod-66'],
    ['leadership', 'Staff Engineer, Cloud Security | Toast. We’re hiring, apply now'],
    ['observability', 'Axiom status: minor issue with observability ingest'],
    ['languages', 'Softwareentwickler*in Apps (Kotlin / Android) (w/m/d/-) Stellenanzeige'],
  ])('keeps %s free of "%s"', (rkey, text) => {
    expect(keep(post(text), feed(rkey))).toBe(false)
  })

  it.each([
    ['observability', 'We moved all our tracing to OpenTelemetry and cut costs in half'],
    ['databases', 'TIL DuckDB will read a file without read_csv if it can find it'],
    ['security', 'Critical CVE-2026-1234 in OpenSSH allows remote code execution'],
    ['distributed', 'This case study shows how a team ran one Kafka cluster across three regions'],
    ['sre', 'Our blameless postmortem template, after 40 incidents'],
  ])('lets %s have "%s"', (rkey, text) => {
    expect(keep(post(text), feed(rkey))).toBe(true)
  })

  it('needs two strong terms when a post is about election politics', () => {
    expect(keep(post('Trump says Kubernetes is bad'), feed('cloud-native'))).toBe(false)
    expect(keep(post('Trump admin moves Kubernetes and Terraform contracts'), feed('cloud-native'))).toBe(true)
  })

  it('drops untagged posts in a non-Latin script', () => {
    expect(keep(post('엔비디아와 애플 CUDA 맥북프로 냉납사건', { record: { text: '엔비디아와 애플 CUDA 맥북프로 냉납사건', createdAt: new Date().toISOString() } }), feed('ai-infra'))).toBe(false)
  })

  it('drops replies and other languages', () => {
    expect(keep(post('OpenTelemetry is great', { record: { text: 'OpenTelemetry is great', createdAt: new Date().toISOString(), reply: {} } }), feed('observability'))).toBe(false)
    expect(keep(post('OpenTelemetry é ótimo', { record: { text: 'OpenTelemetry é ótimo', createdAt: new Date().toISOString(), langs: ['pt'] } }), feed('observability'))).toBe(false)
  })

  it('ranks by engagement over age, dedupes links, caps each author at three', () => {
    const author = { did: 'did:plc:same', handle: 'same.bsky.social' }
    const link = (uri: string) => ({ $type: 'app.bsky.embed.external#view', external: { uri, title: 'OpenTelemetry 2.0' } })
    const posts = [
      post('OpenTelemetry release notes', { likeCount: 5, embed: link('https://example.com/otel?ref=a') }),
      post('OpenTelemetry release notes', { likeCount: 50, embed: link('https://example.com/otel') }),
      ...[1, 2, 3, 4].map((i) => post(`OpenTelemetry tip number ${i} from the same person`, { author, likeCount: 100 - i })),
    ]
    const out = rank(posts, feed('observability'))
    expect(out.filter((p) => p.embed).map((p) => p.likeCount)).toEqual([50])
    expect(out.filter((p) => p.author.did === 'did:plc:same')).toHaveLength(3)
  })

  it('turns terms into OR searches, quoting phrases', () => {
    const [first] = searchQueries(feed('observability'))
    expect(first).toContain('OpenTelemetry || OTel')
    expect(first).toContain('"distributed tracing"')
  })
})
