import { keys } from './query'
import { useQuery } from '@tanstack/react-query'
import { useAtproto } from './atproto'
import type { Story } from './types.js'

// People on PaperWing: anyone with a Bluesky account. Their profile is their listings and mixes,
// read from their own repo (api/_lib/people.ts). Following someone here puts what they list on
// PaperWing into For you and gives them a channel; it's kept with your other synced choices, and
// it isn't a Bluesky follow.

export interface PersonProfile {
  did: string
  handle: string
  name?: string
  avatar?: string
  bio?: string
  followers?: number
}

export interface PersonMix {
  uri: string
  rkey: string
  name: string
  description?: string
  sources: number
}

export interface Person {
  profile: PersonProfile
  stories: Story[]
  mixes: PersonMix[]
  /** What they've shared with a note (io.paperwing.share), newest first. */
  shares?: (Story & { note?: string })[]
  /** The blogs they read, if they publish their blogroll. */
  blogroll?: { url: string; label: string; site?: string }[]
  /** Likes and replies across their listings: the votes and comments they've drawn. */
  totals: { listed: number; votes: number; comments: number }
}

/** Someone you follow on PaperWing. The handle and name are as they were when you followed. */
export interface FollowedPerson {
  did: string
  handle: string
  name?: string
  avatar?: string
}

/** A profile's address: by handle, which reads better than a DID and survives a move between servers. */
export const profilePath = (handleOrDid: string) => `/u/${encodeURIComponent(handleOrDid.replace(/^@/, ''))}`

export async function fetchPerson(actor: string): Promise<Person> {
  const res = await fetch(`/api/feed?src=person&actor=${encodeURIComponent(actor)}`)
  if (!res.ok) throw new Error(res.status === 400 ? 'That isn’t a Bluesky handle' : 'Couldn’t find that person on Bluesky')
  return (await res.json()) as Person
}

export const usePerson = (actor: string | undefined) => useQuery({ queryKey: keys.person(actor ?? ''), queryFn: () => fetchPerson(actor!), enabled: !!actor, staleTime: 120_000 })

/** You, as Bluesky shows you (signed in with Bluesky): for your face in the top bar. Public data, read from Bluesky. */
export function useMe() {
  const did = useAtproto((a) => a.did)
  const handle = useAtproto((a) => a.handle)
  const { data } = useQuery({
    queryKey: keys.me(did),
    queryFn: async () => {
      const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did!)}`)
      if (!res.ok) throw new Error(`Bluesky answered ${res.status}`)
      const p = (await res.json()) as { handle: string; displayName?: string; avatar?: string }
      return { handle: p.handle, name: p.displayName?.trim() || undefined, avatar: p.avatar }
    },
    enabled: !!did,
    staleTime: 3_600_000,
  })
  return did && handle ? { did, handle: data?.handle ?? handle, name: data?.name, avatar: data?.avatar } : undefined
}
