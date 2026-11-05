import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeUpstreams } from '../_test/harness.js'
import { channelId } from '../../src/lib/channelId.js'
import { GET } from '../preview.js'

vi.mock('./frontpage.js', () => ({ getRecord: vi.fn() }))
const net = fakeUpstreams()
const did = 'did:plc:abcdefghijklmnopqrstuvwx'
const key = '3abcdefghijkm'
const origin = 'https://public.api.bsky.app'
const preview = (path: string, query = '') => GET(new Request(`https://paperwing.io/api/preview?path=${encodeURIComponent(path)}${query}`))
const html = async (path: string, query = '') => (await preview(path, query)).text()
const channelPath = (id: string) => `/t/${encodeURIComponent(id)}`
const profile = { did, handle: 'reader.test', displayName: 'A <reader>', description: 'Reads & writes', avatar: 'https://cdn.bsky.app/avatar.jpg', banner: 'https://cdn.bsky.app/banner.jpg' }
const feedUri = `at://${did}/app.bsky.feed.generator/sports`
const feedPath = channelPath(channelId({ kind: 'bskyFeed', uri: feedUri }))
const mockProfile = (data: object) =>
  net
    .get(origin)
    .intercept({ path: '/xrpc/app.bsky.actor.getProfile', query: { actor: 'reader.test' } })
    .reply(200, data)
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('public destination previews', () => {
  it('uses a profile banner as a large card without loading their stories', async () => {
    mockProfile(profile)
    const card = await html('/u/reader.test')
    expect(card).toContain('https://cdn.bsky.app/banner.jpg')
    expect(card).toContain('summary_large_image')
    expect(card).toContain('A &lt;reader&gt; (@reader.test)')
    expect(card).toContain('Reads &amp; writes')
    expect(card).toContain('content="website"')
  })
  it('uses the square avatar when the banner is missing or unsafe', async () => {
    mockProfile({ ...profile, banner: 'javascript:alert(1)' })
    const card = await html('/u/reader.test')
    expect(card).toContain('https://cdn.bsky.app/avatar.jpg')
    expect(card).toContain('content="summary"')
    expect(card).not.toContain('javascript:')
  })
  it.each(['!no-unauthenticated', 'porn', 'spam'])('does not publish labelled profile metadata (%s)', async (val) => {
    mockProfile({ ...profile, labels: [{ val }] })
    const card = await html('/u/reader.test')
    expect(card).not.toContain('cdn.bsky.app')
    expect(card).not.toContain('Reads &amp; writes')
    expect(card).not.toContain('A &lt;reader&gt;')
  })
  it('reuses a Bluesky feed avatar and preserves its encoded channel link', async () => {
    net
      .get(origin)
      .intercept({ path: '/xrpc/app.bsky.feed.getFeedGenerator', query: { feed: feedUri } })
      .reply(200, { view: { displayName: 'Sports & scores', description: 'The latest', avatar: profile.avatar, creator: { did } } })
    const card = await html(feedPath)
    expect(card).toContain('Sports &amp; scores')
    expect(card).toContain(profile.avatar)
    expect(card).toContain('content="summary"')
    expect(card).toContain(`href="https://paperwing.io${feedPath}"`)
  })
  it('reads a Bluesky list title and avatar', async () => {
    const uri = `at://${did}/app.bsky.graph.list/sports`
    net
      .get(origin)
      .intercept({ path: '/xrpc/app.bsky.graph.getList', query: { list: uri, limit: '1' } })
      .reply(200, { list: { name: 'Climbers', avatar: profile.avatar, creator: { did } } })
    expect(await html(channelPath(channelId({ kind: 'bskyFeed', uri })))).toContain('Climbers')
  })
  it('suppresses feed artwork and text when its creator is labelled', async () => {
    net
      .get(origin)
      .intercept({ path: '/xrpc/app.bsky.feed.getFeedGenerator', query: { feed: feedUri } })
      .reply(200, { view: { displayName: 'Hidden title', avatar: profile.avatar, creator: { did, labels: [{ val: '!no-unauthenticated' }] } } })
    const card = await html(feedPath)
    expect(card).not.toContain('Hidden title')
    expect(card).not.toContain(profile.avatar)
  })
  it('uses a public community banner and description', async () => {
    net
      .get('https://lemmy.world')
      .intercept({ path: '/api/v3/community', query: { name: 'science@lemmy.world' } })
      .reply(200, { community_view: { community: { title: 'Science', description: 'New discoveries', banner: 'https://lemmy.world/banner.png' } } })
    const card = await html(channelPath('c:science@lemmy.world'))
    expect(card).toContain('Science')
    expect(card).toContain('New discoveries')
    expect(card).toContain('https://lemmy.world/banner.png')
  })
  it.each([{ nsfw: true }, { deleted: true }, { removed: true }, { visibility: 'Private' }])('hides restricted community metadata (%j)', async (restriction) => {
    net
      .get('https://lemmy.world')
      .intercept({ path: '/api/v3/community', query: { name: 'science@lemmy.world' } })
      .reply(200, { community_view: { community: { title: 'Hidden title', icon: profile.avatar, ...restriction } } })
    const card = await html(channelPath('c:science@lemmy.world'))
    expect(card).not.toContain('Hidden title')
    expect(card).not.toContain(profile.avatar)
  })
  it.each(['mix', 'c'])('uses the public %s record with static artwork', async (route) => {
    const { getRecord } = await import('./frontpage.js')
    vi.mocked(getRecord).mockResolvedValueOnce({
      uri: `at://${did}/io.paperwing.${route === 'c' ? 'board' : 'mix'}/${key}`,
      cid: 'cid',
      value: { name: 'Weekend reads', description: 'Hand-picked reads', sources: [{ kind: 'topic', id: 'climbing' }], createdAt: new Date().toISOString() },
    })
    const path = `/${route}/${encodeURIComponent(did)}/${key}`
    const card = await html(path)
    expect(card).toContain('Weekend reads')
    expect(card).toContain('Hand-picked reads')
    expect(card).toContain(`/og/channels/${route === 'c' ? 'board' : 'mix'}.png`)
    expect(card).toContain(`href="https://paperwing.io${path}"`)
    expect(getRecord).toHaveBeenCalledWith(`at://${did}/io.paperwing.${route === 'c' ? 'board' : 'mix'}/${key}`)
  })
  it('does not fetch a blocked owner or publish a private feed address', async () => {
    const { getRecord } = await import('./frontpage.js')
    vi.stubEnv('PAPERWING_BLOCKED', did)
    expect(await html(`/mix/${did}/${key}`)).not.toContain('Weekend reads')
    expect(getRecord).not.toHaveBeenCalled()
    const card = await html(channelPath('feed:https://example.com/rss?token=secret'))
    expect(card).not.toContain('secret')
    expect(card).toContain('href="https://paperwing.io/"')
  })
  it('describes explicit interests and search links without fetching results', async () => {
    const card = await html(channelPath('q:climbing & bouldering'))
    expect(card).toContain('climbing &amp; bouldering')
    expect(card).toContain('/og/channels/discover.png')
    const search = await html('/search', '&q=baseball%20%26%20cricket')
    expect(search).toContain('baseball &amp; cricket')
    expect(search).toContain('href="https://paperwing.io/search?q=baseball+%26+cricket"')
  })
  it.each(['/t/for-you', '/t/mix:local', '/t/bf-bm9wZQ', '/mix/did:example:bad/bad', '/t/%ZZ'])('keeps malformed and personal paths generic (%s)', async (path) => {
    const card = await html(path)
    expect(card).toContain('content="PaperWing"')
    expect(card).toContain('https://paperwing.io/og.png')
  })
  it('caches an upstream failure briefly and keeps the link usable', async () => {
    net
      .get(origin)
      .intercept({ path: '/xrpc/app.bsky.feed.getFeedGenerator', query: { feed: feedUri } })
      .reply(503, {})
    const res = await preview(feedPath)
    expect(res.headers.get('cache-control')).toContain('s-maxage=300')
    expect(await res.text()).toContain(`href="https://paperwing.io${feedPath}"`)
  })
})
