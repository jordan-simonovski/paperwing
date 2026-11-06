import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
/** Authors' Bluesky profiles, answered in batches by one stub for the whole file (stubs outlive a test here), registered by the first writer that needs it. */
const profiles = new Map<string, { followers: number; labels: string[] }>()
let profilesStubbed = false
/** Set to make Bluesky's profile lookup fail for the rest of a test. */
let profilesDown = false
function profilesOf(did: string, profile: { followers: number; labels: string[] }) {
  profiles.set(did, profile)
  if (profilesStubbed) return
  profilesStubbed = true
  const A = 'https://public.api.bsky.app'
  net
    .get(A)
    .intercept({ path: (p) => p.startsWith('/xrpc/app.bsky.actor.getProfiles?') })
    .reply(({ path }) =>
      profilesDown
        ? { statusCode: 503, data: 'busy' }
        : {
            statusCode: 200,
            data: {
              profiles: new URL(path, A).searchParams.getAll('actors').flatMap((d) => {
                const p = profiles.get(d)
                return p ? [{ did: d, handle: `${d.slice(-6)}.example`, followersCount: p.followers, labels: p.labels.map((val) => ({ val })) }] : []
              }),
            },
          },
    )
    .persist()
}
beforeEach(() => {
  profiles.clear()
  profilesDown = false
})
afterEach(() => {
  delete process.env.PAPERWING_BLOCKED
})

/**
 * A writer on their own PDS with one publication on their own site. `checked`: whether the crawl gets
 * as far as asking (and whether the site confirms it).
 */
function writer({
  labels,
  checked = 'yes',
  publications = 1,
  onAsk,
  followers = 100,
  account = [],
  listedBy = [],
  discussed = 0,
}: {
  labels?: string[]
  /** 'profile': refused on the author's profile alone, before their server or site is asked anything. */
  checked?: 'yes' | 'refused' | 'never' | 'profile'
  publications?: number
  onAsk?: () => void
  /** The author's Bluesky profile: followers, and labels on the account. */
  followers?: number
  account?: string[]
  /** Who lists the blog in their blogroll, and how many people discuss its newest post on Bluesky. */
  listedBy?: string[]
  discussed?: number
} = {}) {
  n++
  // A valid did:plc for every writer: n in base 32, in the DID alphabet.
  const did = `did:plc:${[...n.toString(32)]
    .map((c) => 'abcdefghijklmnopqrstuvwxyz234567'[parseInt(c, 32)])
    .join('')
    .padStart(24, 'a')}`
  const uri = `at://${did}/site.standard.publication/3me5vykp6lf2y`
  const pds = `https://pds-${n}.example`
  const site = `https://writer-${n}.example`
  const name = `Writer ${n}`
  const state = { labels, down: false, listers: listedBy }
  const profile = { followers, labels: account }
  if (checked !== 'never') profilesOf(did, profile)
  if (checked !== 'never' && checked !== 'profile') {
    net
      .get('https://plc.directory')
      .intercept({ path: `/${did}` })
      .reply(200, { service: [{ id: '#atproto_pds', serviceEndpoint: pds }] })
      .persist()
    net
      .get(pds)
      .intercept({ path: (p) => p.startsWith('/xrpc/com.atproto.repo.getRecord?') })
      .reply(() =>
        state.down
          ? { statusCode: 503, data: 'down' }
          : (onAsk?.(), { statusCode: 200, data: { uri, value: { url: site, name, ...(state.labels ? { labels: { values: state.labels.map((val) => ({ val })) } } : {}) } } }),
      )
      .persist()
    if (!labels)
      net
        .get(site)
        .intercept({ path: '/.well-known/site.standard.publication' })
        .reply(200, checked === 'yes' ? uri : 'at://did:plc:someoneelsesomeoneelse12/site.standard.publication/x')
        .persist()
    // Once confirmed: who the author is on Bluesky, and who lists or discusses the blog.
    if (checked === 'yes' && !labels) {
      const param = (p: string, name: string, base: string) => new URL(p, base).searchParams.get(name)
      const C = 'https://constellation.microcosm.blue'
      net
        .get(C)
        .intercept({ path: (p) => p.startsWith('/links/all?') && param(p, 'target', C) === site })
        .reply(200, { links: listedBy.length ? { 'io.paperwing.blogroll': { '.feeds[].url': { records: listedBy.length, distinct_dids: listedBy.length } } } : {} })
        .persist()
      net
        .get(C)
        .intercept({ path: (p) => p.startsWith('/links/all?') && !!param(p, 'target', C)?.startsWith(`${site}/`) })
        .reply(200, { links: discussed ? { 'app.bsky.feed.post': { '.embed.external.uri': { records: discussed, distinct_dids: discussed } } } : {} })
        .persist()
      if (listedBy.length)
        net
          .get(C)
          .intercept({ path: (p) => p.startsWith('/links/distinct-dids?') && param(p, 'target', C) === site })
          .reply(200, () => ({ total: state.listers.length, linking_dids: state.listers, cursor: null }))
          .persist()
    }
  }
  // More publications in the same account, for the per-author cap.
  const more = Array.from({ length: publications - 1 }, (_, i) => `at://${did}/site.standard.publication/3me5vykp6lf${i}a`)
  return {
    did,
    uri,
    site,
    name,
    more,
    relabel: (l: string[]) => (state.labels = l),
    relabelAccount: (l: string[]) => (profile.labels = l),
    serverDown: () => (state.down = true),
    listers: (l: string[]) => (state.listers = l),
  }
}

/** A document write as Jetstream sends it. */
let rkeys = 0
const post = (author: { did: string; uri: string }, at: number, extra: Record<string, unknown> = {}): Posted => ({
  did: author.did,
  time_us: at * 1000,
  kind: 'commit',
  commit: {
    operation: 'create',
    collection: 'site.standard.document',
    rkey: `doc${++rkeys}`,
    record: { site: author.uri, title: 'A post', path: `/p/${at}`, publishedAt: new Date(at).toISOString(), ...extra },
  },
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
      { url: newer.site, title: newer.name, site: new URL(newer.site).hostname, posts: 0, latest: NOW - day, format: 'standard', author: newer.did },
      { url: older.site, title: older.name, site: new URL(older.site).hostname, posts: 0, latest: NOW - 5 * day, format: 'standard', author: older.did },
    ])
  })

  it('leaves out an unconfirmed site, adult or hidden labels, future dates, loose posts, someone else’s publication and blocked accounts', async () => {
    const unverified = writer({ checked: 'refused' })
    const adult = writer({ labels: ['porn'] })
    const labelledPost = writer({ checked: 'never' })
    const future = writer({ checked: 'never' })
    const victim = writer({ checked: 'never' })
    const impostor = writer({ checked: 'never' })
    const blocked = writer({ checked: 'never' })
    const loose = writer({ checked: 'never' })
    process.env.PAPERWING_BLOCKED = blocked.did
    const { source } = stream(
      post(unverified, NOW - day),
      post(adult, NOW - day),
      post(labelledPost, NOW - day, { labels: { values: [{ val: 'sexual' }] } }),
      post(future, NOW + 10 * day),
      // A post can only vouch for its own author's publication.
      post({ did: impostor.did, uri: victim.uri }, NOW - day),
      post(blocked, NOW - day),
      // A post that names a plain site, in no publication: nothing to list, so nobody is asked.
      post(loose, NOW - day, { site: loose.site }),
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

  it('asks about a site that didn’t confirm at most once a day', async () => {
    const one = writer({ checked: 'refused' })
    await crawlDirectory(NOW, stream(post(one, NOW - day)).source)
    // Its next post within the day costs nothing: no upstream is faked for it.
    expect(await crawlDirectory(NOW + 3_600_000, stream(post(one, NOW)).source)).toMatchObject({ checked: 0, listed: 0 })
  })

  it('drops a listed publication whose weekly re-check fails, say because it is now labelled adult', async () => {
    const one = writer()
    await crawlDirectory(NOW, stream(post(one, NOW - day)).source)
    one.relabel(['porn'])
    expect(await crawlDirectory(NOW + 8 * day, stream(post(one, NOW + 8 * day - 1000)).source)).toMatchObject({ checked: 1, listed: 0 })
    expect(await directory(NOW + 8 * day)).toEqual([])
  })

  it('keeps a site that keeps refusing at once a day, not twice', async () => {
    const one = writer({ checked: 'refused' })
    await crawlDirectory(NOW, stream(post(one, NOW - day)).source)
    expect(await crawlDirectory(NOW + 25 * 3_600_000, stream(post(one, NOW)).source)).toMatchObject({ checked: 1 })
    expect(await crawlDirectory(NOW + 26 * 3_600_000, stream(post(one, NOW + 1000)).source)).toMatchObject({ checked: 0 })
  })

  it('checks one publication per account a run, so nobody can use up the checks', async () => {
    const one = writer({ publications: 3 })
    const many = [one.uri, ...one.more].map((uri, i) => post({ did: one.did, uri }, NOW - day + i))
    expect(await crawlDirectory(NOW, stream(...many).source)).toMatchObject({ checked: 1 })
  })

  it('starts no checks past its deadline, and a listed blog that misses its check stays listed', async () => {
    const listed = writer()
    await crawlDirectory(NOW, stream(post(listed, NOW - day)).source)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      // The first site's answer takes the clock past the run's deadline.
      const slow = writer({ onAsk: () => vi.setSystemTime(Date.now() + 50_000) })
      const others = Array.from({ length: 15 }, () => writer())
      const later = NOW + 8 * day
      const res = await crawlDirectory(later, stream(...[slow, ...others, listed].map((w) => post(w, later - day))).source)
      expect(res).toMatchObject({ checked: 16, listed: 16 })
      // Not asked: neither failed nor dropped, and not re-dated either, so it's checked on its next post.
      expect(Object.keys(await kv().hgetall('rd:directory:failed'))).not.toContain(listed.uri)
      expect((await directory(later)).find((f) => f.url === listed.site)).toMatchObject({ latest: NOW - day })
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops waiting on a check still running at its deadline, and saves what it has', async () => {
    const pds = 'https://slow-pds.example'
    const did = 'did:plc:slowslowslowslowslowslow'
    const uri = `at://${did}/site.standard.publication/3me5vykp6lf2y`
    profilesOf(did, { followers: 100, labels: [] })
    net
      .get('https://plc.directory')
      .intercept({ path: `/${did}` })
      .reply(200, { service: [{ id: '#atproto_pds', serviceEndpoint: pds }] })
    // A server that takes its time answering.
    net
      .get(pds)
      .intercept({ path: (p) => p.startsWith('/xrpc/com.atproto.repo.getRecord?') })
      .reply(200, { uri, value: { url: 'https://slow.example', name: 'Slow' } })
      .delay(2000)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const run = crawlDirectory(NOW, stream(post({ did, uri }, NOW - day)).source)
      await new Promise((r) => setTimeout(r, 50))
      vi.setSystemTime(Date.now() + 50_000)
      expect(await run).toMatchObject({ checked: 1, listed: 0 })
      expect(await kv().get('rd:directory:cursor')).toBe(String((NOW - day) * 1000))
      expect(Object.keys(await kv().hgetall('rd:directory:failed'))).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('doesn’t move its cursor past posts it failed to record', async () => {
    const one = writer()
    // Saving what the run found fails: its posts must be read again next run.
    const save = vi.spyOn(kv(), 'hset').mockRejectedValueOnce(new Error('the store is down'))
    try {
      await expect(crawlDirectory(NOW, stream(post(one, NOW - 2 * day)).source)).rejects.toThrow('the store is down')
    } finally {
      save.mockRestore()
    }
    const next = stream()
    await crawlDirectory(NOW, next.source)
    expect(next.asked).toEqual([(NOW - day) * 1000])
  })

  it('stops showing an account or publication as soon as it’s blocked', async () => {
    const one = writer()
    await crawlDirectory(NOW, stream(post(one, NOW - day)).source)
    process.env.PAPERWING_BLOCKED = one.did
    expect(await directory(NOW)).toEqual([])
    process.env.PAPERWING_BLOCKED = one.uri
    expect(await directory(NOW)).toEqual([])
  })

  it('leaves out accounts labelled adult or automated, ones not shown to logged-out viewers, and brand-new ones', async () => {
    // Turned away on their Bluesky profile alone: their servers and sites are never asked.
    const adult = writer({ account: ['porn'], checked: 'profile' })
    const privateAccount = writer({ account: ['!no-unauthenticated'], checked: 'profile' })
    const bot = writer({ account: ['bot'], checked: 'profile' })
    const brandNew = writer({ followers: 3, checked: 'profile' })
    const { source } = stream(...[adult, privateAccount, bot, brandNew].map((w) => post(w, NOW - day)))
    expect(await crawlDirectory(NOW, source)).toMatchObject({ checked: 0, listed: 0 })
    expect(await directory(NOW)).toEqual([])
  })

  it('drops a listed blog within the hour once its author is labelled or stops being shown to logged-out viewers', async () => {
    const one = writer()
    const two = writer()
    await crawlDirectory(NOW, stream(post(one, NOW - day), post(two, NOW - day)).source)
    one.relabelAccount(['!no-unauthenticated'])
    two.relabelAccount(['porn'])
    // The next run, with nothing new from either of them.
    await crawlDirectory(NOW + 3_600_000, stream().source)
    expect(await directory(NOW + 3_600_000)).toEqual([])
  })

  it('changes nothing in a run where Bluesky can’t say who the authors are', async () => {
    const one = writer()
    await crawlDirectory(NOW, stream(post(one, NOW - day)).source)
    const next = writer({ checked: 'never' })
    // Bluesky's profile lookup is down for this run.
    profilesDown = true
    expect(await crawlDirectory(NOW + 3_600_000, stream(post(next, NOW)).source)).toMatchObject({ checked: 0 })
    expect((await directory(NOW + 3_600_000)).map((f) => f.url)).toEqual([one.site])
  })

  it('puts a blog people list and discuss ahead of a newer one nobody does', async () => {
    // Two readers with blogrolls, both accounts that could be listed themselves.
    profilesOf('did:plc:readerreaderreaderreader', { followers: 80, labels: [] })
    profilesOf('did:plc:anotheranotheranotherano', { followers: 50, labels: [] })
    const quiet = writer({ followers: 12 })
    const read = writer({ followers: 400, listedBy: ['did:plc:readerreaderreaderreader', 'did:plc:anotheranotheranotherano'], discussed: 3 })
    await crawlDirectory(NOW, stream(post(quiet, NOW - 3_600_000), post(read, NOW - 12 * 3_600_000)).source)
    const list = await directory(NOW)
    expect(list.map((f) => f.url)).toEqual([read.site, quiet.site])
    // Who wrote it and who lists it, so the app can bring forward the ones by people you follow.
    expect(list[0]).toMatchObject({ author: read.did, listedBy: ['did:plc:readerreaderreaderreader', 'did:plc:anotheranotheranotherano'] })
  })

  it('hides a feed that publishes more than a dozen new posts a day, but not a blog importing its archive', async () => {
    const feed = writer()
    const importer = writer()
    const hourly = Array.from({ length: 13 }, (_, i) => post(feed, NOW - i * 3_600_000))
    // Thirty old posts imported today, and one new one.
    const archive = [...Array.from({ length: 30 }, (_, i) => post(importer, NOW - (30 + i) * day)), post(importer, NOW - 3_600_000)]
    await crawlDirectory(NOW, stream(...hourly, ...archive).source)
    expect((await directory(NOW)).map((f) => f.url)).toEqual([importer.site])
  })

  it('counts a feed’s posts across runs, and each post once even when several share a time', async () => {
    const hourly = writer()
    for (let i = 12; i >= 0; i--) await crawlDirectory(NOW - i * 3_600_000, stream(post(hourly, NOW - i * 3_600_000 - 60_000)).source)
    const batch = writer()
    const stamped = NOW - 3_600_000
    await crawlDirectory(NOW, stream(...Array.from({ length: 13 }, () => post(batch, stamped))).source)
    expect(await directory(NOW)).toEqual([])
  })

  it('counts only listers who could be listed themselves, never the author, and drops one whose blogroll stops listing it', async () => {
    const lister = 'did:plc:listerlisterlisterlister'
    const tiny = 'did:plc:tinytinytinytinytinytiny'
    profilesOf(lister, { followers: 300, labels: [] })
    profilesOf(tiny, { followers: 2, labels: [] })
    const one = writer({ listedBy: [lister, tiny] })
    one.listers([lister, tiny, one.did])
    await crawlDirectory(NOW, stream(post(one, NOW - day)).source)
    expect((await directory(NOW))[0]).toMatchObject({ listedBy: [lister] })
    // Their blogroll no longer lists it: gone from the next run on.
    one.listers([])
    await crawlDirectory(NOW + 3_600_000, stream().source)
    expect((await directory(NOW + 3_600_000))[0].listedBy).toBeUndefined()
  })

  it('keeps a listed blog whose server is briefly down at its weekly check, without re-dating it', async () => {
    const one = writer()
    await crawlDirectory(NOW, stream(post(one, NOW - day)).source)
    one.serverDown()
    const later = NOW + 8 * day
    expect(await crawlDirectory(later, stream(post(one, later - 1000)).source)).toMatchObject({ checked: 1, listed: 0 })
    expect((await directory(later)).map((f) => [f.url, f.latest])).toEqual([[one.site, NOW - day]])
    expect(Object.keys(await kv().hgetall('rd:directory:failed'))).toEqual([])
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

  it('only crawls on a scheduled run, and then runs even without push set up', async () => {
    expect((await call(push, '/api/push?task=directory')).status).toBe(401)
    process.env.CRON_SECRET = 'the-secret'
    // Jetstream, faked at the socket: it opens to the right address and closes with nothing to send.
    const opened: string[] = []
    vi.stubGlobal(
      'WebSocket',
      class {
        onclose?: () => void
        constructor(url: string) {
          opened.push(url)
          setTimeout(() => this.onclose?.(), 0)
        }
        close() {}
      },
    )
    try {
      const res = await call(push, '/api/push?task=directory', { headers: { authorization: 'Bearer the-secret' } })
      expect(res).toMatchObject({ status: 200, body: { posts: 0, checked: 0, listed: 0 } })
      expect(opened).toEqual([expect.stringMatching(/^wss:\/\/jetstream2\.us-east\.bsky\.network\/subscribe\?wantedCollections=site\.standard\.document&cursor=\d+$/)])
    } finally {
      vi.unstubAllGlobals()
      delete process.env.CRON_SECRET
    }
  })
})
