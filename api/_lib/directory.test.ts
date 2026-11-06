import { afterEach, describe, expect, it } from 'vitest'
import { call, fakeUpstreams, memoryStore } from '../_test/harness'
import { crawlDirectory, directory } from './directory'
import { kv } from './kv'
import { GET as feed } from '../feed'
import { GET as push } from '../push'

const net = fakeUpstreams()
memoryStore()
const NOW = Date.UTC(2026, 10, 6)
const RELAY = 'https://relay1.us-east.bsky.network'
const day = 86_400_000
let n = 0
afterEach(() => {
  delete process.env.PAPERWING_BLOCKED
  delete process.env.CRON_SECRET
})

/**
 * A writer on their own PDS: one publication on their site, with documents dated `posted`.
 * `checked`: whether the crawl gets as far as asking the site to confirm it (and whether it does).
 */
function writer({ posted = [NOW - day], labels, checked = 'yes' }: { posted?: number[]; labels?: string[]; checked?: 'yes' | 'refused' | 'never' } = {}) {
  n++
  const did = `did:plc:${String.fromCharCode(96 + n).repeat(24)}`
  const uri = `at://${did}/site.standard.publication/3me5vykp6lf2y`
  const pds = `https://pds-${n}.example`
  const site = `https://writer-${n}.example`
  const name = `Writer ${n}`
  const value = { url: site, name, ...(labels ? { labels: { values: labels.map((val) => ({ val })) } } : {}) }
  const list = (collection: string) => (p: string) => p.startsWith('/xrpc/com.atproto.repo.listRecords?') && new URL(p, pds).searchParams.get('collection') === collection
  net
    .get('https://plc.directory')
    .intercept({ path: `/${did}` })
    .reply(200, { service: [{ id: '#atproto_pds', serviceEndpoint: pds }] })
  net
    .get(pds)
    .intercept({ path: list('site.standard.publication') })
    .reply(200, { records: [{ uri, value }] })
    .persist()
  net
    .get(pds)
    .intercept({ path: list('site.standard.document') })
    .reply(200, { records: posted.map((at, i) => ({ uri: `at://${did}/site.standard.document/doc${i}`, value: { site: uri, title: `Post ${i}`, publishedAt: new Date(at).toISOString() } })) })
    .persist()
  if (checked !== 'never') {
    net
      .get(pds)
      .intercept({ path: (p) => p.startsWith('/xrpc/com.atproto.repo.getRecord?') })
      .reply(200, { uri, value })
      .persist()
    net
      .get(site)
      .intercept({ path: '/.well-known/site.standard.publication' })
      .reply(200, checked === 'yes' ? uri : 'at://did:plc:someoneelsesomeoneelse12/site.standard.publication/x')
      .persist()
  }
  return { did, uri, site, name }
}

const relayPage = (dids: string[], cursor?: string, after?: string) =>
  net
    .get(RELAY)
    .intercept({ path: (p) => p.startsWith('/xrpc/com.atproto.sync.listReposByCollection?') && (new URL(p, RELAY).searchParams.get('cursor') ?? undefined) === after })
    .reply(200, { repos: dids.map((did) => ({ did })), ...(cursor ? { cursor } : {}) })

describe('the open web directory', () => {
  it('lists verified publications that posted lately, newest post first, ready to follow', async () => {
    const older = writer({ posted: [NOW - 5 * day] })
    const newer = writer({ posted: [NOW - 10 * day, NOW - day] })
    relayPage([older.did, newer.did])
    expect(await crawlDirectory(NOW)).toEqual({ checked: 2, listed: 2, done: true })
    expect(await directory(NOW)).toEqual([
      { url: newer.site, title: newer.name, site: new URL(newer.site).hostname, posts: 0, latest: NOW - day, format: 'standard' },
      { url: older.site, title: older.name, site: new URL(older.site).hostname, posts: 0, latest: NOW - 5 * day, format: 'standard' },
    ])
  })

  it('leaves out a site that does not confirm the publication, a quiet one, an adult one and a blocked one', async () => {
    const unverified = writer({ checked: 'refused' })
    const quiet = writer({ posted: [NOW - 200 * day], checked: 'never' })
    const future = writer({ posted: [NOW + 10 * day], checked: 'never' })
    const adult = writer({ labels: ['porn'], checked: 'never' })
    // A blocked account is never asked anything: no upstream is faked for it.
    const blocked = 'did:plc:blockedblockedblockedblo'
    process.env.PAPERWING_BLOCKED = blocked
    relayPage([unverified.did, quiet.did, future.did, adult.did, blocked, 'not-a-did'])
    expect(await crawlDirectory(NOW)).toEqual({ checked: 4, listed: 0, done: true })
    expect(await directory(NOW)).toEqual([])
  })

  it('walks the relay a page per run, then starts over and forgets publications it no longer finds', async () => {
    const kept = writer({ posted: [NOW - 5 * day] })
    const gone = writer({ posted: [NOW - 6 * day] })
    relayPage([kept.did], 'page-2')
    relayPage([gone.did], undefined, 'page-2')
    expect(await crawlDirectory(NOW - 4 * day)).toMatchObject({ done: false })
    expect(await crawlDirectory(NOW - 4 * day)).toMatchObject({ done: true })
    expect((await directory(NOW - 4 * day)).map((f) => f.url)).toEqual([kept.site, gone.site])

    // The next pass finds only the first: the other ages out.
    relayPage([kept.did], 'page-2')
    relayPage([], undefined, 'page-2')
    await crawlDirectory(NOW)
    await crawlDirectory(NOW)
    expect(Object.keys(await kv().hgetall('rd:directory'))).toEqual([kept.uri])
  })

  it('is served to the app from KV, without asking anyone', async () => {
    const one = writer({ posted: [Date.now() - day] })
    relayPage([one.did])
    await crawlDirectory(Date.now())
    const res = await call<{ url: string }[]>(feed, '/api/feed?src=directory')
    expect(res.status).toBe(200)
    expect(res.body.map((f) => f.url)).toEqual([one.site])
  })

  it('only crawls on a scheduled run', async () => {
    expect((await call(push, '/api/push?task=directory')).status).toBe(401)
    process.env.CRON_SECRET = 'the-secret'
    relayPage([])
    const res = await call(push, '/api/push?task=directory', { headers: { authorization: 'Bearer the-secret' } })
    expect(res).toMatchObject({ status: 200, body: { checked: 0, listed: 0, done: true } })
  })
})
