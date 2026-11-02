import { cleanMix, MIX_NSID } from '../../src/lib/mixSources.js'
import { cleanSubmission, SUBMISSION_NSID } from '../../src/lib/paperwing.js'
import { cleanShare, SHARE_NSID } from '../../src/lib/social.js'
import type { Story } from '../../src/lib/types.js'
import type { Person, PersonProfile } from '../../src/lib/people.js'
import { posts } from './atlinks.js'
import { postTime, toStory } from './bsky.js'
import { listRecords } from './frontpage.js'
import { fetchJson, linkKey } from './http.js'

// A person on PaperWing: their Bluesky profile, the stories they've listed on PaperWing, and the
// mixes they've published. Everything comes from their own Bluesky repo and Bluesky's public API,
// so a profile needs no account here and no database: it's whatever their repo says.

const HANDLE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*$/
const DID = /^did:(?:plc:[a-z2-7]{24}|web:[a-z0-9.%:-]+)$/

/** A handle or DID, normalised, if it could be one. */
export function actorOf(raw: string): string | undefined {
  const a = raw.trim().replace(/^@/, '').toLowerCase()
  return DID.test(a) || HANDLE.test(a) ? a : undefined
}

export async function person(actor: string): Promise<Person> {
  const p = await fetchJson<{ did: string; handle: string; displayName?: string; avatar?: string; description?: string; followersCount?: number; labels?: { val: string }[] }>(
    `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`,
    { timeoutMs: 6000 },
  )
  // Accounts that ask not to be shown to logged-out viewers aren't, here either.
  const hidden = p.labels?.some((l) => l.val === '!no-unauthenticated')
  const profile: PersonProfile = hidden
    ? { did: p.did, handle: p.handle }
    : { did: p.did, handle: p.handle, name: p.displayName?.trim() || undefined, avatar: p.avatar, bio: p.description?.trim() || undefined, followers: p.followersCount }
  if (hidden) return { profile, stories: [], mixes: [], shares: [], totals: { listed: 0, votes: 0, comments: 0 } }

  const [subs, mixRecords, shareRecords] = await Promise.all([listRecords<unknown>(p.did, SUBMISSION_NSID, 60), listRecords<unknown>(p.did, MIX_NSID, 25), listRecords<unknown>(p.did, SHARE_NSID, 60)])
  // Only their own posts count: a submission pointing at someone else's post isn't theirs to list.
  const listed = new Map<string, string | undefined>()
  for (const r of subs) {
    const s = cleanSubmission(r.value)
    if (s && s.post.uri.split('/')[2] === p.did && !listed.has(s.post.uri)) listed.set(s.post.uri, s.board)
  }
  const found = await posts([...listed.keys()])
  const stories = found
    .sort((a, b) => postTime(b) - postTime(a))
    .map((post) => {
      const board = listed.get(post.uri)
      return { ...toStory(post), sourceLabel: 'PaperWing', ...(board ? { tags: [board] } : {}) }
    })
  const mixes = mixRecords.flatMap((r) => {
    const m = cleanMix(r.value)
    return m ? [{ uri: r.uri, rkey: r.uri.split('/').pop()!, name: m.name, description: m.description, sources: m.sources.length }] : []
  })
  // Shared items: links they thought worth reading, with what they said. Each is the link itself,
  // so it meets the same story from HN or Lemmy in a feed and becomes one row.
  const shares = shareRecords.flatMap((r): (Story & { note?: string })[] => {
    const s = cleanShare(r.value)
    if (!s) return []
    let host = s.url
    try {
      host = new URL(s.url).hostname.replace(/^www\./, '')
    } catch {
      /* keep the url */
    }
    return [
      {
        key: linkKey(s.url),
        source: 'rss',
        sourceLabel: host,
        title: s.title,
        url: s.url,
        discussionUrl: null,
        createdAt: Date.parse(s.createdAt) || 0,
        hasThread: false,
        author: p.handle,
        sharedBy: [p.handle],
        ...(s.note ? { shareNote: s.note, note: s.note } : {}),
        shareUri: r.uri,
      },
    ]
  })
  return {
    profile,
    stories,
    mixes,
    shares,
    totals: { listed: stories.length, votes: stories.reduce((n, s) => n + (s.score ?? 0), 0), comments: stories.reduce((n, s) => n + (s.comments ?? 0), 0) },
  }
}
