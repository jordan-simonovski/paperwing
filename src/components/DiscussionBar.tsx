import { Quote } from 'lucide-react'
import { useMemo } from 'react'
import { compact } from '../lib/format'
import { friendPlace, useFriendsOf, type Friend } from '../lib/friends'
import { useDiscussions } from '../lib/hooks'
import { usePretext } from '../lib/pretext'
import type { Story } from '../lib/types'
import { sourceLabel } from './Source'
import { StoryIcon } from './SourceIcon'

/** Every thread about this story: its own, the same link elsewhere, and other coverage of the event. */
export function usePlaces(story: Story, alsoOn: Story[] = [], coverage: Story[] = []): Story[] {
  const found = useDiscussions(story.url)
  return useMemo(() => {
    const seen = new Set<string>()
    const out: Story[] = []
    for (const s of [story, ...alsoOn, ...coverage, ...(found.data ?? [])]) {
      if (!s.hasThread || seen.has(s.key)) continue
      seen.add(s.key)
      out.push(s)
    }
    return out.sort((a, b) => (b.comments ?? 0) - (a.comments ?? 0))
  }, [story, alsoOn, coverage, found.data])
}

/** Posts by people you follow about this link, by story key. */
function useFriendPosts(story: Story, alsoOn: Story[]): Map<string, Friend> {
  const friends = useFriendsOf({ ...story, alsoOn })
  return useMemo(() => new Map(friends.flatMap((f) => (friendPlace(f) ? [[f.post!, f] as const] : []))), [friends])
}

/**
 * The signature: one link's conversation, split by where it is happening. Each segment is as long
 * as its share of all the comments; tapping one switches the reader to that thread. Conversations
 * people you follow started come first, under their names: the bar only. The places other parts of
 * the reader use (the discussion summary among them) stay as usePlaces gives them.
 */
export function DiscussionBar({ story, alsoOn = [], coverage = [], onOpen }: { story: Story; alsoOn?: Story[]; coverage?: Story[]; onOpen: (key: string) => void }) {
  const found = usePlaces(story, alsoOn, coverage)
  const friendPosts = useFriendPosts(story, alsoOn)
  const places = useMemo(() => {
    const keys = new Set(found.map((s) => s.key))
    const theirs = [...friendPosts.values()].map(friendPlace).filter((s): s is Story => !!s && !keys.has(s.key))
    return [...theirs, ...found].sort((a, b) => Number(friendPosts.has(b.key)) - Number(friendPosts.has(a.key)))
  }, [found, friendPosts])
  const nameOf = (s: Story) => {
    const f = friendPosts.get(s.key)
    return f ? `${f.name ?? `@${f.handle}`}${f.how === 'quoted' ? ' (quote)' : ''}` : sourceLabel(s)
  }
  // The thread being read fills in red from its start; still with Motion off or reduced motion.
  const moving = usePretext()

  if (places.length < 2) return null
  const total = places.reduce((n, s) => n + (s.comments ?? 0), 0)

  return (
    <section className="mt-6" aria-label="Where this is being discussed">
      <p className="mb-2 text-[0.8125rem] text-ink-2">
        {places.some((p) => coverage.includes(p)) ? 'This story is discussed' : 'Posted'} in {places.length} places, <span className="num">{compact(total)}</span> comments in all
      </p>
      <div className={`dbar${moving ? ' moving' : ''}`}>
        {places.map((s) => (
          <button
            key={s.key}
            style={{ flexGrow: Math.max(1, s.comments ?? 0) }}
            aria-current={s.key === story.key}
            aria-label={`${nameOf(s)}, ${s.comments ?? 0} comments`}
            title={`${nameOf(s)}: ${s.comments ?? 0} comments`}
            onClick={() => s.key !== story.key && onOpen(s.key)}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem]">
        {places.map((s) => (
          <button
            key={s.key}
            className={`inline-flex items-center gap-1.5 ${s.key === story.key ? 'font-bold text-ink' : 'text-ink-2 hover:text-ink'}`}
            onClick={() => s.key !== story.key && onOpen(s.key)}
          >
            <PlaceMark s={s} friend={friendPosts.get(s.key)} />
            {nameOf(s)} <span className="num">{compact(s.comments ?? 0)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/** A place's mark: the network's logo, or the face of the person you follow who started it, with a quote mark on a quote. */
function PlaceMark({ s, friend }: { s: Story; friend?: Friend }) {
  if (!friend) return <StoryIcon story={s} size={13} />
  return (
    <span className="relative inline-block size-[15px] flex-none" aria-hidden>
      {friend.avatar ? (
        <img src={friend.avatar} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-full rounded-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center rounded-full bg-sunk text-[0.5625rem] font-bold">{friend.handle[0]?.toUpperCase()}</span>
      )}
      {friend.how === 'quoted' && (
        <span className="absolute -bottom-1 -right-1 grid size-[10px] place-items-center rounded-full bg-ink text-[var(--ground)]">
          <Quote size={6} strokeWidth={3} />
        </span>
      )}
    </span>
  )
}
