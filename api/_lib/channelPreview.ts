import { parseChannelId, channelId } from '../../src/lib/channelId.js'
import { cleanSource, cleanMix, AT_MIX, mixUri } from '../../src/lib/mixSources.js'
import { cleanBoard, BOARD_NSID } from '../../src/lib/social.js'
import { isPrivateAddress } from '../../src/lib/publishers.js'
import { HOME } from '../../src/lib/oauthClient.js'
import { TOPIC_CARD_SIZE, channelImagePath, type ChannelArtwork } from '../../src/lib/topicCard.js'
import { fetchJson } from './http.js'
import { actorOf } from './people.js'
import { getRecord } from './frontpage.js'
import { blocked } from './paperwing.js'

export interface Card {
  title: string
  description: string
  image?: string
  imageAlt?: string
  imageSize?: { width: number; height: number }
  type?: 'website' | 'article'
  /** Square artwork should not be cropped into a wide card. */
  small?: boolean
  /** Retry a temporary stand-in sooner than a complete preview. */
  partial?: boolean
}

const string = (value: unknown) => (typeof value === 'string' ? value : '')
export const httpsImage = (value: unknown): string | undefined => {
  try {
    const url = new URL(string(value))
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined
  } catch {
    return undefined
  }
}
const staticCard = (kind: ChannelArtwork, title: string, description: string): Card => ({
  title,
  description,
  type: 'website',
  image: `https://${HOME}${channelImagePath(kind)}`,
  imageSize: TOPIC_CARD_SIZE,
  imageAlt: `${kind === 'discover' ? 'Discover' : kind === 'mix' ? 'Mixes' : kind === 'board' ? 'Community boards' : 'Feeds'} on PaperWing`,
})
const artwork = (base: Card, banner: unknown, avatar: unknown): Card => {
  const wide = httpsImage(banner)
  const image = wide ?? httpsImage(avatar)
  return image ? { ...base, image, small: !wide, imageSize: undefined, imageAlt: `${base.title} artwork` } : base
}
type Labelled = { labels?: { val: string; neg?: boolean }[] }
const restricted = (value?: Labelled) => value?.labels?.some((label) => !label.neg) ?? false
const publicJson = <T>(url: string) => fetchJson<T>(url, { timeoutMs: 5000, maxBytes: 500_000 })
const bsky = 'https://public.api.bsky.app/xrpc/'

async function profileCard(actor: string): Promise<Card | undefined> {
  if (blocked().has(actor)) return undefined
  const p = await publicJson<Labelled & { did: string; handle: string; displayName?: string; description?: string; banner?: string; avatar?: string }>(
    `${bsky}app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`,
  )
  if (restricted(p) || blocked().has(p.did)) return undefined
  if (!p.did || !p.handle) throw new Error('Missing profile')
  const name = p.displayName ? `${string(p.displayName)} (@${string(p.handle)})` : `@${string(p.handle)}`
  return artwork({ title: `${name} on PaperWing`, description: string(p.description) || 'Stories and discoveries on PaperWing.', type: 'website' }, p.banner, p.avatar)
}

async function feedCard(uri: string): Promise<Card | undefined> {
  const list = uri.includes('/app.bsky.graph.list/')
  type Feed = Labelled & { displayName?: string; name?: string; description?: string; avatar?: string; creator?: Labelled & { did: string } }
  const result = await publicJson<{ view?: Feed; list?: Feed }>(
    `${bsky}${list ? 'app.bsky.graph.getList?list=' : 'app.bsky.feed.getFeedGenerator?feed='}${encodeURIComponent(uri)}${list ? '&limit=1' : ''}`,
  )
  const feed = list ? result.list : result.view
  if (!feed || !(feed.displayName || feed.name)) throw new Error('Missing feed')
  if (restricted(feed) || restricted(feed.creator) || blocked().has(uri) || blocked().has(uri.split('/')[2]) || (feed.creator && blocked().has(feed.creator.did))) return undefined
  return artwork(staticCard('feed', string(feed.displayName || feed.name), string(feed.description) || 'Follow this Bluesky feed on PaperWing.'), undefined, feed.avatar)
}

async function communityCard(name: string): Promise<Card | undefined> {
  // Resolve remote communities through a known public instance, not an arbitrary host from a URL.
  const data = await publicJson<{
    community_view?: { community?: { title?: string; description?: string; banner?: string; icon?: string; nsfw?: boolean; deleted?: boolean; removed?: boolean; visibility?: string } }
  }>(`https://lemmy.world/api/v3/community?name=${encodeURIComponent(name)}`)
  const c = data.community_view?.community
  if (!c?.title) throw new Error('Missing community')
  if (c.nsfw || c.deleted || c.removed || (c.visibility && c.visibility !== 'Public')) return undefined
  return artwork(staticCard('board', string(c.title), string(c.description) || `Read ${name} on PaperWing.`), c.banner, c.icon)
}

async function recordCard(kind: 'mix' | 'board', did: string, rkey: string): Promise<Card | undefined> {
  const uri = kind === 'mix' ? mixUri(did, rkey) : `at://${did}/${BOARD_NSID}/${rkey}`
  if (blocked().has(did) || blocked().has(uri)) return undefined
  const record = await getRecord<unknown>(uri)
  const value = kind === 'mix' ? cleanMix(record.value) : cleanBoard(record.value)
  if (!value) throw new Error('Missing public record')
  return staticCard(kind, value.name, value.description || (kind === 'mix' ? 'A hand-picked mix of sources on PaperWing.' : 'Join the conversation on PaperWing.'))
}

interface Destination {
  path: string
  card: () => Promise<Card | undefined>
}
const destination = (path: string, card: Destination['card']): Destination => ({ path, card })
const discovery = (path: string, title: string) => destination(path, async () => staticCard('discover', title, `Explore stories about ${title} on PaperWing.`))

/** Only information explicitly addressed by a public link; never preferences, follows or local mixes. */
export function channelPreview(path: string, params: URLSearchParams): Destination | undefined {
  if (path.length > 4000) return undefined
  try {
    const profile = /^\/u\/([^/]{3,260})\/?$/.exec(path)
    if (profile) {
      const actor = actorOf(decodeURIComponent(profile[1]))
      return actor ? destination(`/u/${encodeURIComponent(actor)}`, () => profileCard(actor)) : undefined
    }
    const record = /^\/(mix|c)\/([^/]+)\/([a-z2-7]{13})\/?$/.exec(path)
    if (record) {
      const did = decodeURIComponent(record[2])
      if (!AT_MIX.test(mixUri(did, record[3]))) return undefined
      return destination(`/${record[1]}/${encodeURIComponent(did)}/${record[3]}`, () => recordCard(record[1] === 'mix' ? 'mix' : 'board', did, record[3]))
    }
    if (path === '/search') {
      const query = params.get('q')?.trim().slice(0, 200)
      return query ? discovery(`/search?${new URLSearchParams({ q: query })}`, query) : discovery('/search', 'Discover something new')
    }
    const match = /^\/t\/([^/]+)\/?$/.exec(path)
    const id = match ? decodeURIComponent(match[1]) : ''
    const address = parseChannelId(id)
    const canonical = `/t/${encodeURIComponent(id)}`
    if (!address) return undefined
    switch (address.kind) {
      case 'interest':
        return id.length <= 202 ? discovery(canonical, id.slice(2)) : undefined
      case 'bskyFeed':
        return cleanSource({ kind: 'bskyFeed', uri: address.uri }) ? destination(canonical, () => feedCard(address.uri)) : undefined
      case 'community':
        return address.name.length <= 200 ? destination(canonical, () => communityCard(address.name)) : undefined
      case 'person':
        return channelPreview(`/u/${encodeURIComponent(address.actor)}`, params)
      case 'board':
        return channelPreview(`/c/${encodeURIComponent(address.did)}/${address.rkey}`, params)
      case 'followedMix':
        return channelPreview(`/mix/${encodeURIComponent(address.did)}/${address.rkey}`, params)
      case 'feed': {
        if (isPrivateAddress(address.url) || address.url.length > 2000) return undefined
        const url = new URL(address.url)
        // A feed's host is safe to describe without fetching its articles or discovering more URLs.
        const format = params.get('format') === 'standard' ? '?format=standard' : ''
        return destination(`/t/${encodeURIComponent(channelId(address))}${format}`, async () => staticCard('feed', url.hostname, `Read this ${format ? 'publication' : 'feed'} on PaperWing.`))
      }
      default:
        return undefined
    }
  } catch {
    return undefined
  }
}
