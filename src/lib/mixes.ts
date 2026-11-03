import { deleteRecord, putRecord, useAtproto } from './atproto'
import { channelId } from './channelId'
import { cleanMix, FEEDGEN_DID, feedRkey, MIX_NSID, type MixRecord, type MixSource } from './mixSources'
import { feed } from './sources/http'
import { usePrefs, type FollowedMix, type Mix } from './store'
import type { FeedRef } from './topics'
import { toast } from './ui'

// Mixes in the app: building them, publishing them to your own atproto repo (and optionally as a
// Bluesky feed PaperWing serves), and following other people's by their share link.

const B32 = '234567abcdefghijklmnopqrstuvwxyz'
/** An atproto TID: a sortable 13-character id from the clock, used as the mix's record key. */
export function tid(now = Date.now() * 1000 + Math.floor(Math.random() * 1000)): string {
  let n = (BigInt(now) << 10n) | BigInt(Math.floor(Math.random() * 1024))
  let out = ''
  for (let i = 0; i < 13; i++) {
    out = B32[Number(n & 31n)] + out
    n >>= 5n
  }
  return out
}

export const newMix = (name = ''): Mix => ({ id: tid(), name: name.trim(), sources: [], updatedAt: Date.now() })

export function saveMix(mix: Mix) {
  const { mixes, set } = usePrefs.getState()
  const next = { ...mix, updatedAt: Date.now() }
  set({ mixes: mixes.some((m) => m.id === mix.id) ? mixes.map((m) => (m.id === mix.id ? next : m)) : [...mixes, next] })
  return next
}

/** What a mix's sources fetch: a topic brings its main feeds, as it does in For you. */
export function mixFeedRefs(sources: MixSource[], topicFeeds: (id: string) => FeedRef[]): FeedRef[] {
  return sources.flatMap((s): FeedRef[] => {
    switch (s.kind) {
      case 'topic':
        return topicFeeds(s.id)
      case 'rss':
      case 'standard':
        return [{ kind: s.kind, url: s.url, label: s.label }]
      case 'lemmy':
        return [{ kind: 'lemmy', community: s.community, via: s.via }]
      case 'bskyFeed':
        return [{ kind: 'bskyFeed', uri: s.uri, name: s.name }]
      case 'news':
        return [{ kind: 'news', q: s.q }]
    }
  })
}

const record = (m: Mix): MixRecord => ({ name: m.name, ...(m.description ? { description: m.description } : {}), sources: m.sources, createdAt: new Date(m.updatedAt).toISOString() })

/** The link anyone can open to see and follow a published mix. */
export const shareLink = (uri: string) => {
  const [, , did, , rkey] = uri.split('/')
  return `${location.origin}/mix/${did}/${rkey}`
}

/** Writes the mix to your repo (again, after an edit), and its Bluesky feed if it has one. */
/** A mix's key is a TID: anything else (say, arriving through sync) is never written or deleted under. */
const validId = (id: string) => /^[a-z2-7]{13}$/.test(id)

/** Your own record addresses for a mix, rebuilt from your account rather than trusted from storage. */
const ownUris = (mix: Mix) => {
  const did = useAtproto.getState().did
  if (!did || !validId(mix.id)) throw new Error('That mix can’t be published from here')
  return { mix: `at://${did}/${MIX_NSID}/${mix.id}`, feed: `at://${did}/app.bsky.feed.generator/${feedRkey(mix.id)}` }
}

export async function publishMix(mix: Mix, asFeed = !!mix.feed): Promise<Mix> {
  if (!useAtproto.getState().did) throw new Error('Sign in with Bluesky first (Settings, Sources)')
  ownUris(mix)
  if (!mix.sources.length) throw new Error('Add a source first')
  const ref = await putRecord(MIX_NSID, mix.id, record(mix) as unknown as Record<string, unknown>)
  let feed = mix.feed
  if (asFeed) {
    // A Bluesky feed's name is at most 24 characters; its description says where it comes from.
    const displayName = [...new Intl.Segmenter().segment(mix.name)]
      .slice(0, 24)
      .map((x) => x.segment)
      .join('')
    const description = `${mix.description ? `${mix.description}\n\n` : ''}A PaperWing mix: Bluesky posts sharing its stories.`.slice(0, 300)
    feed = (await putRecord('app.bsky.feed.generator', feedRkey(mix.id), { did: FEEDGEN_DID, displayName, description, createdAt: new Date().toISOString() })).uri
  }
  return saveMix({ ...mix, published: ref.uri, feed })
}

/**
 * What publishing, unpublishing or removing the feed did, put onto the editor's copy of the mix.
 * Writing to Bluesky takes a moment and the editor stays live meanwhile, so anything changed while
 * it ran (the name, a source) is kept rather than replaced by the copy that was sent.
 */
export const afterPublishing = (editing: Mix, done: Mix): Mix => ({ ...editing, published: done.published, feed: done.feed })

/** Takes the mix (and its feed) out of your repo; it stays here as a private mix. */
export async function unpublishMix(mix: Mix): Promise<Mix> {
  const own = ownUris(mix)
  if (mix.feed) await deleteRecord(own.feed)
  if (mix.published) await deleteRecord(own.mix)
  return saveMix({ ...mix, published: undefined, feed: undefined })
}

export async function removeFeed(mix: Mix): Promise<Mix> {
  if (mix.feed) await deleteRecord(ownUris(mix).feed)
  return saveMix({ ...mix, feed: undefined })
}

export function deleteMix(mix: Mix) {
  const { mixes, set } = usePrefs.getState()
  set({ mixes: mixes.filter((m) => m.id !== mix.id) })
}

/** Someone's published mix, read by PaperWing's server from their repo. */
export async function fetchMix(uri: string): Promise<{ mix: MixRecord; did: string; handle?: string }> {
  const res = (await feed('mix', { uri })) as { mix: unknown; did: string; handle?: string }
  // Checked here too: what comes back is someone else's data.
  const mix = cleanMix(res.mix)
  if (!mix) throw new Error('That mix is empty or malformed')
  return { mix, did: res.did, handle: res.handle }
}

export function followMix(uri: string, found: { mix: MixRecord; did: string; handle?: string }) {
  const { followedMixes, set } = usePrefs.getState()
  const entry: FollowedMix = { uri, name: found.mix.name, by: found.handle ?? found.did, description: found.mix.description, sources: found.mix.sources, fetchedAt: Date.now() }
  set({ followedMixes: followedMixes.some((m) => m.uri === uri) ? followedMixes.map((m) => (m.uri === uri ? entry : m)) : [...followedMixes, entry] })
  toast(`Following ${found.mix.name}. It's under Mixes.`)
}

export function unfollowMix(uri: string) {
  const { followedMixes, set } = usePrefs.getState()
  set({ followedMixes: followedMixes.filter((m) => m.uri !== uri) })
}

/** A mix's channel id: `mix:<id>` for yours, `mix:<did>:<rkey>` for one you follow. */
export const mixChannel = (m: Mix | FollowedMix) => channelId('id' in m ? { kind: 'mix', id: m.id } : { kind: 'followedMix', did: m.uri.split('/')[2], rkey: m.uri.split('/')[4] })

/** Followed mixes change when their owner edits them: re-read any older than half a day, quietly. */
export async function refreshFollowedMixes(maxAge = 12 * 3600_000) {
  const stale = usePrefs.getState().followedMixes.filter((m) => Date.now() - m.fetchedAt > maxAge)
  for (const m of stale) {
    try {
      const found = await fetchMix(m.uri)
      const { followedMixes, set } = usePrefs.getState()
      set({
        followedMixes: followedMixes.map((x) =>
          x.uri === m.uri ? { ...x, name: found.mix.name, by: found.handle ?? x.by, description: found.mix.description, sources: found.mix.sources, fetchedAt: Date.now() } : x,
        ),
      })
    } catch {
      /* gone or unreachable: keep what we had, try again later */
    }
  }
}

/** Whether two sources are the same thing (the same feed, community, topic…), ignoring their labels. */
export function sameSource(a: MixSource, b: MixSource): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'topic':
      return a.id === (b as typeof a).id
    case 'rss':
    case 'standard':
      return a.url === (b as typeof a).url
    case 'lemmy':
      return a.community === (b as typeof a).community
    case 'bskyFeed':
      return a.uri === (b as typeof a).uri
    case 'news':
      return a.q.toLowerCase() === (b as typeof a).q.toLowerCase()
  }
}

/**
 * Adds a source to a mix, or takes it out. A published mix is republished in the background so its
 * followers (and its Bluesky feed) see the change; if that fails, it's still saved here.
 */
export function toggleInMix(mix: Mix, source: MixSource): { mix: Mix; added: boolean; republish?: Promise<Mix> } {
  const has = mix.sources.some((s) => sameSource(s, source))
  const next = saveMix({ ...mix, sources: has ? mix.sources.filter((s) => !sameSource(s, source)) : [...mix.sources, source] })
  const republish = next.published && next.sources.length ? publishMix(next) : undefined
  return { mix: next, added: !has, republish }
}
