import { beforeEach, describe, expect, it } from 'vitest'
import { call, fakeUpstreams, memoryStore } from '../_test/harness'
import { standardFeed, standardPublication } from './standard'
import { discoverFeeds } from './discover'
import { GET } from '../feed'

const net = fakeUpstreams()
memoryStore()
const head = (html: string) => `<html><head>${html}</head><body></body></html>`
let n = 0
let did: string
let uri: string
beforeEach(() => {
  did = `did:plc:${String.fromCharCode(97 + n++).repeat(24)}`
  uri = `at://${did}/site.standard.publication/3me5vykp6lf2y`
})

function publication(url = 'https://writer.example') {
  net
    .get('https://writer.example')
    .intercept({ path: `/.well-known/site.standard.publication${new URL(url).pathname.replace(/\/$/, '')}` })
    .reply(200, uri)
  net
    .get('https://plc.directory')
    .intercept({ path: `/${did}` })
    .reply(200, { service: [{ id: '#atproto_pds', serviceEndpoint: 'https://standard-pds.example' }] })
  net
    .get('https://standard-pds.example')
    .intercept({ path: (p) => p.startsWith('/xrpc/com.atproto.repo.getRecord?') })
    .reply(200, { uri, cid: 'publication-cid', value: { url, name: 'A writer’s journal' } })
}

describe('Standard.site publications', () => {
  it('scans at most 300 records and verifies only the newest 20 documents', async () => {
    publication()
    const author = did
    const pages: number[] = []
    const verified: string[] = []
    net
      .get('https://standard-pds.example')
      .intercept({ path: (p) => p.startsWith('/xrpc/com.atproto.repo.listRecords?') && new URL(p, 'https://standard-pds.example').searchParams.get('repo') === author })
      .reply(200, ({ path }) => {
        const page = Number(new URL(path, 'https://standard-pds.example').searchParams.get('cursor') ?? 0)
        pages.push(page)
        return {
          records: Array.from({ length: 100 }, (_, i) => {
            const key = String(page * 100 + i)
            return {
              uri: `at://${did}/site.standard.document/${key}`,
              value: { site: uri, title: key, path: `/cap-post-${key}`, publishedAt: new Date(Date.UTC(2026, 10, 1) + Number(key) * 1000).toISOString() },
            }
          }),
          cursor: String(page + 1),
        }
      })
      .persist()
    net
      .get('https://writer.example')
      .intercept({ path: (p) => p.startsWith('/cap-post-') })
      .reply(200, ({ path }) => {
        verified.push(path)
        return head(`<link rel="site.standard.document" href="at://${did}/site.standard.document/${path.slice('/cap-post-'.length)}">`)
      })
      .persist()
    const stories = await standardFeed('https://writer.example')
    expect(pages).toEqual([0, 1, 2])
    expect(stories.map((s) => s.title)).toEqual(Array.from({ length: 20 }, (_, i) => String(299 - i)))
    expect(verified.sort()).toEqual(Array.from({ length: 20 }, (_, i) => `/cap-post-${280 + i}`).sort())
  })

  it.each(['comment', 'script', 'attribute'])('does not verify a document from link text inside a %s', async (kind) => {
    publication()
    const doc = `at://${did}/site.standard.document/3medocument12`
    net
      .get('https://standard-pds.example')
      .intercept({ path: (p) => p.startsWith('/xrpc/com.atproto.repo.listRecords?') })
      .reply(200, { records: [{ uri: doc, value: { site: uri, title: 'Unverified', path: '/unverified', publishedAt: '2026-11-01T10:00:00Z' } }] })
    const link = `<link rel="site.standard.document" href="${doc}">`
    const html = kind === 'comment' ? `<!-- ${link} -->` : kind === 'script' ? `<script>const example = '${link}'</script>` : `<link rel="site.standard.document" data-note=" href='${doc}'">`
    net.get('https://writer.example').intercept({ path: '/unverified' }).reply(200, head(html))
    await expect(standardFeed('https://writer.example')).rejects.toThrow('Could not verify Standard.site articles')
  })

  it('lets a reader cold-load five different native publications in one minute', async () => {
    const original = did
    for (let i = 0; i < 5; i++) {
      did = `${original.slice(0, -1)}${i + 2}`
      uri = `at://${did}/site.standard.publication/3me5vykp6lf2y`
      const url = `https://writer.example/journal-${i}`
      publication(url)
      net
        .get('https://standard-pds.example')
        .intercept({ path: (p) => p.startsWith('/xrpc/com.atproto.repo.listRecords?') })
        .reply(200, { records: [] })
      expect((await call(GET, `/api/feed?src=standard&url=${encodeURIComponent(url)}`, { headers: { 'x-forwarded-for': '203.0.113.21' } })).status).toBe(200)
    }
  })

  it('reads a followed publication whose record URL has a trailing slash', async () => {
    publication('https://writer.example/journal/')
    net
      .get('https://standard-pds.example')
      .intercept({ path: (p) => p.startsWith('/xrpc/com.atproto.repo.listRecords?') })
      .reply(200, { records: [] })
    expect(await standardFeed('https://writer.example/journal')).toEqual([])
  })

  it('requires a publication URL at the native feed endpoint', async () => {
    expect(await call(GET, '/api/feed?src=standard')).toMatchObject({ status: 400, body: { error: 'url required' } })
  })

  it('finds a publication in a subfolder from a document’s page', async () => {
    const doc = `at://${did}/site.standard.document/3medocument12`
    net
      .get('https://writer.example')
      .intercept({ path: '/journal/a-post' })
      .reply(200, head(`<link rel="site.standard.document" href="${doc}">`))
    net
      .get('https://plc.directory')
      .intercept({ path: `/${did}` })
      .reply(200, { service: [{ id: '#atproto_pds', serviceEndpoint: 'https://standard-pds.example' }] })
    net
      .get('https://standard-pds.example')
      .intercept({ path: (p) => p.includes('collection=site.standard.document') })
      .reply(200, { uri: doc, value: { site: uri } })
    net
      .get('https://standard-pds.example')
      .intercept({ path: (p) => p.includes('collection=site.standard.publication') })
      .reply(200, { uri, value: { url: 'https://writer.example/journal', name: 'Journal' } })
    net.get('https://writer.example').intercept({ path: '/.well-known/site.standard.publication/journal' }).reply(200, uri)
    expect(await discoverFeeds('https://writer.example/journal/a-post')).toMatchObject([{ url: 'https://writer.example/journal', title: 'Journal', format: 'standard' }])
  })

  it('refuses an author’s claim on a different website', async () => {
    net
      .get('https://plc.directory')
      .intercept({ path: `/${did}` })
      .reply(200, { service: [{ id: '#atproto_pds', serviceEndpoint: 'https://standard-pds.example' }] })
    net
      .get('https://standard-pds.example')
      .intercept({ path: (p) => p.startsWith('/xrpc/com.atproto.repo.getRecord?') })
      .reply(200, { uri, value: { url: 'https://someone-else.example', name: 'Forged' } })
    await expect(standardPublication('https://writer.example', uri)).rejects.toThrow('Publication does not match this site')
  })

  it('refuses an unverified publication hint', async () => {
    net
      .get('https://plc.directory')
      .intercept({ path: `/${did}` })
      .reply(200, { service: [{ id: '#atproto_pds', serviceEndpoint: 'https://standard-pds.example' }] })
    net
      .get('https://standard-pds.example')
      .intercept({ path: (p) => p.startsWith('/xrpc/com.atproto.repo.getRecord?') })
      .reply(200, { uri, value: { url: 'https://writer.example', name: 'Journal' } })
    net.get('https://writer.example').intercept({ path: '/.well-known/site.standard.publication' }).reply(200, 'at://someone-else/site.standard.publication/other')
    await expect(standardPublication('https://writer.example', uri)).rejects.toThrow('could not be verified')
  })

  it('never fetches a private server named by an author’s DID document', async () => {
    net.get('https://writer.example').intercept({ path: '/.well-known/site.standard.publication' }).reply(200, uri)
    net
      .get('https://plc.directory')
      .intercept({ path: `/${did}` })
      .reply(200, { service: [{ id: '#atproto_pds', serviceEndpoint: 'https://127.0.0.1' }] })
    await expect(standardFeed('https://writer.example')).rejects.toThrow('Host not allowed')
  })

  it('reports a malformed document response as a failure, rather than an empty publication', async () => {
    publication()
    net
      .get('https://standard-pds.example')
      .intercept({ path: (p) => p.startsWith('/xrpc/com.atproto.repo.listRecords?') })
      .reply(200, { error: 'not a list' })
    await expect(standardFeed('https://writer.example')).rejects.toThrow('Malformed Standard.site documents')
  })

  it('reads successive pages newest first and keeps labelled or unverified documents out', async () => {
    publication()
    const record = (key: string, path: string, extra = {}) => ({
      uri: `at://${did}/site.standard.document/${key}`,
      value: { site: uri, title: key, path, publishedAt: '2026-11-01T10:00:00Z', ...extra },
    })
    net
      .get('https://standard-pds.example')
      .intercept({ path: (p) => !p.includes('reverse=') && !p.includes('cursor=') })
      .reply(200, { records: [record('hidden', '/hidden', { labels: { values: [{ val: 'porn' }] } }), record('unverified', '/unverified')], cursor: 'page-two' })
    net
      .get('https://standard-pds.example')
      .intercept({ path: (p) => p.includes('cursor=page-two') })
      .reply(200, { records: [record('verified', '/verified')] })
    net
      .get('https://writer.example')
      .intercept({ path: '/unverified' })
      .reply(200, head(`<link rel="site.standard.document" data-href="at://${did}/site.standard.document/unverified">`))
    net
      .get('https://writer.example')
      .intercept({ path: '/verified' })
      .reply(200, head(`<link rel="site.standard.document" href="at://${did}/site.standard.document/verified">`))
    expect(await standardFeed('https://writer.example')).toMatchObject([{ title: 'verified', url: 'https://writer.example/verified' }])
  })

  it('discovers a native publication from its website without requiring an RSS feed', async () => {
    net
      .get('https://writer.example')
      .intercept({ path: '/' })
      .reply(200, head(`<link rel="site.standard.publication" href="${uri}">`))
    publication()
    expect(await discoverFeeds('https://writer.example')).toEqual([{ url: 'https://writer.example', title: 'A writer’s journal', site: 'writer.example', posts: 0, format: 'standard' }])
  })

  it('reads a publication only when its website points back to its record', async () => {
    publication()
    expect(await standardPublication('https://writer.example')).toEqual({ uri, url: 'https://writer.example', name: 'A writer’s journal' })
  })

  it('shares a cached native read across callers and trailing-slash variants', async () => {
    publication()
    net
      .get('https://standard-pds.example')
      .intercept({ path: (p) => p.startsWith('/xrpc/com.atproto.repo.listRecords?') })
      .reply(200, { records: [] })
    expect(await standardFeed('https://writer.example')).toEqual([])
    expect(await standardFeed('https://writer.example/')).toEqual([])
  })

  it('reads native documents as publisher stories, excluding other publications and forged authors', async () => {
    publication()
    const doc = { site: uri, title: 'The open web', path: '/the-open-web', publishedAt: '2026-11-01T10:00:00Z', description: 'A <small> beginning', tags: ['web'] }
    net
      .get('https://standard-pds.example')
      .intercept({ path: (p) => p.startsWith('/xrpc/com.atproto.repo.listRecords?') })
      .reply(200, {
        records: [
          { uri: `at://${did}/site.standard.document/3me5vykp6lf2z`, value: doc },
          { uri: `at://${did}/site.standard.document/other`, value: { ...doc, site: 'at://did:plc:elsewhere/site.standard.publication/other' } },
          { uri: 'at://did:plc:elsewhere/site.standard.document/forged', value: doc },
        ],
      })
    net
      .get('https://writer.example')
      .intercept({ path: '/the-open-web' })
      .reply(200, head(`<link rel="site.standard.document" href="at://${did}/site.standard.document/3me5vykp6lf2z">`))
    expect(await standardFeed('https://writer.example')).toMatchObject([
      {
        source: 'rss',
        sourceLabel: 'A writer’s journal',
        url: 'https://writer.example/the-open-web',
        title: 'The open web',
        text: '<p>A &lt;small&gt; beginning</p>',
        tags: ['web'],
        hasThread: false,
      },
    ])
  })
})
