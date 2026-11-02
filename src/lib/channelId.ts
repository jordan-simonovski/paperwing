// A channel's id names what it shows: "for-you", a topic ("observability"), or an address with a
// prefix ("c:science@lemmy.world", "cb:<did>:<rkey>"). Ids live in URLs (/t/<id>), prefs and
// sync, so they arrive from anywhere: this module is the one place they're read and written, and it
// refuses anything malformed rather than letting it reach a fetch. (storyKey.ts does the same for
// stories.)

export type ChannelAddress =
  /** A channel with a plain name: For you, a source (hn, lobsters…) or a topic. Resolved by name. */
  | { kind: 'named'; name: string }
  /** A free-text interest you added ("q:sourdough"). */
  | { kind: 'interest'; id: string }
  /** PaperWing's front page, or one of its topic boards. */
  | { kind: 'paperwing'; board?: string }
  /** A community board (io.paperwing.board), by its owner and record key. */
  | { kind: 'board'; did: string; rkey: string }
  /** What someone lists on PaperWing, by handle or DID. */
  | { kind: 'person'; actor: string }
  /** A mix: yours by id, or one you follow by its owner and record key. */
  | { kind: 'mix'; id: string }
  | { kind: 'followedMix'; did: string; rkey: string }
  /** A Lemmy community as its own channel. */
  | { kind: 'community'; name: string }
  /** A Bluesky custom feed or list. */
  | { kind: 'bskyFeed'; uri: string }
  /** One RSS feed you added. */
  | { kind: 'feed'; url: string }

const DID = /^did:[a-z0-9:._%-]+$/
const RKEY = /^[a-z2-7]{13}$/
const COMMUNITY = /^[a-z0-9_]+@[a-z0-9.-]+$/i
const NAME = /^[a-z0-9-]+$/

const toBase64Url = (text: string) => {
  let bin = ''
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromBase64Url = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))

/** A channel's id from its address. */
export function channelId(a: ChannelAddress): string {
  switch (a.kind) {
    case 'named':
      return a.name
    case 'interest':
      return a.id
    case 'paperwing':
      return a.board ? `paperwing:${a.board}` : 'paperwing'
    case 'board':
      return `cb:${a.did}:${a.rkey}`
    case 'person':
      return `u:${a.actor.replace(/^@/, '').toLowerCase()}`
    case 'mix':
      return `mix:${a.id}`
    case 'followedMix':
      return `mix:${a.did}:${a.rkey}`
    case 'community':
      return `c:${a.name}`
    case 'bskyFeed':
      return `bf-${toBase64Url(a.uri)}`
    case 'feed':
      return `feed:${a.url}`
  }
}

/** A channel id's address, or undefined when the id is malformed (a prefix with nothing valid after it). */
export function parseChannelId(id: string): ChannelAddress | undefined {
  if (id === 'paperwing') return { kind: 'paperwing' }
  if (id.startsWith('paperwing:')) {
    const board = id.slice(10)
    return NAME.test(board) ? { kind: 'paperwing', board } : undefined
  }
  if (id.startsWith('cb:')) {
    const [did, rkey] = splitLast(id.slice(3))
    return DID.test(did) && RKEY.test(rkey) ? { kind: 'board', did, rkey } : undefined
  }
  if (id.startsWith('mix:')) {
    const rest = id.slice(4)
    if (!rest.includes(':')) return rest ? { kind: 'mix', id: rest } : undefined
    const [did, rkey] = splitLast(rest)
    return DID.test(did) && RKEY.test(rkey) ? { kind: 'followedMix', did, rkey } : undefined
  }
  if (id.startsWith('u:')) {
    const actor = id.slice(2)
    return actor && !/[\s/?#]/.test(actor) ? { kind: 'person', actor } : undefined
  }
  if (id.startsWith('c:')) {
    const name = id.slice(2)
    return COMMUNITY.test(name) ? { kind: 'community', name } : undefined
  }
  if (id.startsWith('bf-')) {
    try {
      const uri = fromBase64Url(id.slice(3))
      return uri.startsWith('at://') ? { kind: 'bskyFeed', uri } : undefined
    } catch {
      return undefined
    }
  }
  if (id.startsWith('feed:')) {
    const url = id.slice(5)
    try {
      const u = new URL(url)
      return u.protocol === 'https:' || u.protocol === 'http:' ? { kind: 'feed', url } : undefined
    } catch {
      return undefined
    }
  }
  if (id.startsWith('q:')) return id.length > 2 ? { kind: 'interest', id } : undefined
  return NAME.test(id) ? { kind: 'named', name: id } : undefined
}

/** "did:plc:abc:rkey" → ["did:plc:abc", "rkey"]: a DID has colons of its own, so the key is after the last. */
function splitLast(s: string): [string, string] {
  const at = s.lastIndexOf(':')
  return at < 0 ? [s, ''] : [s.slice(0, at), s.slice(at + 1)]
}
