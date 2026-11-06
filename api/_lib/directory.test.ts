import { afterEach, describe, expect, it } from 'vitest'
import { call, fakeUpstreams, memoryStore } from '../_test/harness'
import { crawlDirectory, directory, type Posted } from './directory'
import { kv } from './kv'
import { GET as feed } from '../feed'
import { GET as push } from '../push'

const net = fakeUpstreams()
memoryStore()
const NOW = Date.UTC(2026, 10, 6)
const day = 86_400_000
let n = 0
afterEach(() => {
  delete process.env.PAPERWING_BLOCKED
})

/**
 * A writer on their own PDS with one publication on their own site. `checked`: whether the crawl gets
 * as far as asking (and whether the site confirms it).
 */
function writer({ labels, checked = 'yes' }: { labels?: string[]; checked?: 'yes' | 'refused' | 'never' } = {}) {
  n++
  const did = `did:plc:${String.fromCharCode(96 + n).repeat(24)}`
  const uri = `at://${did}/site.standard.publication/3me5vykp6lf2y`
  const pds = `https://pds-${n}.example`
  const site = `https://writer-${n}.example`
  const name = `Writer ${n}`
  if (checked !== 'never') {
    net
      .get('https://plc.directory')
      .intercept({ path: `/${did}` })
      .reply(200, { service: [{ id: '#atproto_pds', serviceEndpoint: pds }] })
    net
      .get(pds)
      .intercept({ path: (p) => p.startsWith('/xrpc/com.atproto.repo.getRecord?') })
      .reply(200, { uri, value: { url: site, name, ...(labels ? { labels: { values: labels.map((val) => ({ val })) } } : {}) } })
      .persist()
    if (!labels)
      net
        .get(site)
        .intercept({ path: '/.well-known/site.standard.publication' })
        .reply(200, checked === 'yes' ? uri : 'at://did:plc:someoneelsesomeoneelse12/site.standard.publication/x')
  }
  return { did, uri, site, name }
}

/** A document write as Jetstream sends it. */
const post = (author: { did: string; uri: string }, at: number, extra: Record<string, unknown> = {}): Posted => ({
  did: author.did,
  time_us: at * 1000,
  kind: 'commit',
  commit: { operation: 'create', collection: 'site.standard.document', record: { site: author.uri, title: 'A post', publishedAt: new Date(at).toISOString(), ...extra } },
})

/** Jetstream's replay, faked: these events, and a note of the cursor each run asked from. */
function stream(...events: Posted[]) {
  const asked: number[] = []
  return {
    asked,
    source: async function* (cursor: number) {
      asked.push(cursor)
      yield* events
    },
  }
}

describe('the open web directory', () => {
  it('lists the publications people just posted to, once their sites confirm them, newest post first', async () => {
    const older = writer()
    const newer = writer()
    const { source } = stream(post(older, NOW - 5 * day), post(newer, NOW - 3 * day), post(newer, NOW - day))
    expect(await crawlDirectory(NOW, source)).toMatchObject({ checked: 2, listed: 2 })
    expect(await directory(NOW)).toEqual([
      { url: newer.site, title: newer.name, site: new URL(newer.site).hostname, posts: 0, latest: NOW - day, format: 'standard' },
      { url: older.site, title: older.name, site: new URL(older.site).hostname, posts: 0, latest: NOW - 5 * day, format: 'standard' },
    ])
  })

  it('leaves out an unconfirmed site, adult or hidden labels, future dates, someone else’s publication and blocked accounts', async () => {
    const unverified = writer({ checked: 'refused' })
    const adult = writer({ labels: ['porn'] })
    const labelledPost = writer({ checked: 'never' })
    const future = writer({ checked: 'never' })
    const victim = writer({ checked: 'never' })
    const impostor = writer({ checked: 'never' })
    const blocked = writer({ checked: 'never' })
    process.env.PAPERWING_BLOCKED = blocked.did
    const { source } = stream(
      post(unverified, NOW - day),
      post(adult, NOW - day),
      post(labelledPost, NOW - day, { labels: { values: [{ val: 'sexual' }] } }),
      post(future, NOW + 10 * day),
      // A post can only vouch for its own author's publication.
      post({ did: impostor.did, uri: victim.uri }, NOW - day),
      post(blocked, NOW - day),
      { ...post(unverified, NOW - day), did: 'not-a-did' },
      { ...post(unverified, NOW - day), commit: { operation: 'delete', collection: 'site.standard.document' } },
    )
    expect(await crawlDirectory(NOW, source)).toMatchObject({ checked: 2, listed: 0 })
    expect(await directory(NOW)).toEqual([])
  })

  it('picks up where it left off, and keeps a confirmed publication current without asking anyone again for a week', async () => {
    const one = writer()
    const first = stream(post(one, NOW - 2 * day))
    await crawlDirectory(NOW, first.source)
    expect(first.asked).toEqual([(NOW - day) * 1000])

    // The site is never asked again this week: no upstream is faked for it.
    const second = stream(post(one, NOW - 1000))
    expect(await crawlDirectory(NOW, second.source)).toMatchObject({ checked: 0, listed: 1 })
    expect(second.asked).toEqual([(NOW - 2 * day) * 1000])
    expect((await directory(NOW)).map((f) => f.latest)).toEqual([NOW - 1000])
  })

  it('forgets publications that have gone quiet', async () => {
    const one = writer()
    await crawlDirectory(NOW, stream(post(one, NOW - day)).source)
    await crawlDirectory(NOW + 100 * day, stream().source)
    expect(await kv().hgetall('rd:directory')).toEqual({})
  })

  it('is served to the app from KV, without asking anyone', async () => {
    const one = writer()
    await crawlDirectory(Date.now(), stream(post(one, Date.now() - day)).source)
    const res = await call<{ url: string }[]>(feed, '/api/feed?src=directory')
    expect(res.status).toBe(200)
    expect(res.body.map((f) => f.url)).toEqual([one.site])
  })

  it('only crawls on a scheduled run', async () => {
    expect((await call(push, '/api/push?task=directory')).status).toBe(401)
  })
})
