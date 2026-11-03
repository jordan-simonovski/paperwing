import { channelId } from './channelId'
import { bskyFeedChannel } from './channels'
import { toast } from './ui'

// What a pasted link is, when it's something PaperWing can follow as itself rather than a site to
// read: a Bluesky feed or person, a Lemmy community, or a PaperWing board. Each opens its own channel,
// where Follow or Join already lives. Anything else is a site (the publisher finder) or a link to post.

export type Followable = { kind: 'bskyFeed'; actor: string; rkey: string; label: string } | { kind: 'path'; path: string; label: string }

const HANDLE = /^[a-z0-9.-]+\.[a-z]{2,}$|^did:(plc|web):[a-z0-9.:%-]+$/i

export function followable(link: string): Followable | undefined {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return undefined
  }
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  const host = url.hostname.replace(/^www\./, '')

  if (host === 'bsky.app' && parts[0] === 'profile' && parts[1] && HANDLE.test(parts[1])) {
    if (parts[2] === 'feed' && parts[3]) return { kind: 'bskyFeed', actor: parts[1], rkey: parts[3], label: 'Open this Bluesky feed' }
    if (parts.length === 2) return { kind: 'path', path: `/t/${channelId({ kind: 'person', actor: parts[1] })}`, label: `Open @${parts[1].replace(/^@/, '')}’s posts` }
    return undefined
  }
  // A PaperWing board's own address.
  if (host === 'paperwing.io' && parts[0] === 'c' && parts[1]?.startsWith('did:') && parts[2]) return { kind: 'path', path: `/c/${parts[1]}/${parts[2]}`, label: 'Open this board' }
  // A Lemmy community, on any instance: /c/name, or /c/name@another.instance.
  if (parts[0] === 'c' && parts[1] && parts.length === 2 && /^[a-z0-9_]+(@[a-z0-9.-]+)?$/i.test(parts[1])) {
    const name = parts[1].includes('@') ? parts[1] : `${parts[1]}@${host}`
    return { kind: 'path', path: `/t/${channelId({ kind: 'community', name: name.toLowerCase() })}`, label: `Open c/${name.split('@')[0]}` }
  }
  return undefined
}

/** Opens it: a Bluesky feed is addressed by its maker's DID, so a handle is looked up first. */
export async function openFollowable(f: Followable, navigate: (path: string) => void) {
  if (f.kind === 'path') return navigate(f.path)
  try {
    let did = f.actor
    if (!did.startsWith('did:')) {
      const res = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(f.actor)}`)
      did = res.ok ? (((await res.json()) as { did?: string }).did ?? '') : ''
      if (!did) throw new Error(`Bluesky doesn’t know @${f.actor}`)
    }
    navigate(`/t/${bskyFeedChannel(`at://${did}/app.bsky.feed.generator/${f.rkey}`)}`)
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Couldn’t open that feed', { tone: 'error' })
  }
}
