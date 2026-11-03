import { useMemo } from 'react'
import { compact } from '../lib/format'
import { useDiscussions } from '../lib/hooks'
import { usePretext } from '../lib/pretext'
import type { Story } from '../lib/types'
import { sourceLabel } from './Source'
import { StoryIcon } from './SourceIcon'

/**
 * The signature: one link's conversation, split by where it is happening. Each segment is as long
 * as its share of all the comments; tapping one switches the reader to that thread.
 */
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

export function DiscussionBar({ story, alsoOn = [], coverage = [], onOpen }: { story: Story; alsoOn?: Story[]; coverage?: Story[]; onOpen: (key: string) => void }) {
  const places = usePlaces(story, alsoOn, coverage)
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
            aria-label={`${sourceLabel(s)}, ${s.comments ?? 0} comments`}
            title={`${sourceLabel(s)}: ${s.comments ?? 0} comments`}
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
            <StoryIcon story={s} size={13} />
            {sourceLabel(s)} <span className="num">{compact(s.comments ?? 0)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
