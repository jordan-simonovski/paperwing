import { useMemo } from 'react'
import { reasons, rowReason, storyFeatures } from '../lib/features'
import { usePrefs } from '../lib/store'
import { featureLabel } from '../lib/tasteLabel'
import type { Story } from '../lib/types'

/** One line on what your votes say about this story: "You like AI and kubernetes", "You've voted down theregister.com". */
export function WhyRanked({ story, topics }: { story: Story; topics: string[] }) {
  const affinity = usePrefs((p) => p.affinity)
  const interests = usePrefs((p) => p.interests)
  const why = useMemo(() => reasons(storyFeatures({ ...story, topics }), affinity, 3), [story, topics, affinity])
  if (!why.length) return null
  const names = (pull: (n: number) => boolean) => why.filter((r) => pull(r.pull)).map((r) => featureLabel(r.key, interests).name)
  const liked = names((n) => n > 0)
  const disliked = names((n) => n < 0)
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0])
  return (
    <p className="text-[0.8125rem] text-ink-3">
      {liked.length > 0 && <>Ranked up: you like {list(liked)}</>}
      {liked.length > 0 && disliked.length > 0 && '. '}
      {disliked.length > 0 && (
        <>
          {liked.length ? 'Down' : 'Ranked down'}: you voted down {list(disliked)}
        </>
      )}
    </p>
  )
}

/**
 * On a row in a ranked feed: the one thing about your taste that clearly moved this story, if
 * anything did. The recipe is written down; this shows it where people read.
 */
export function TasteLine({ story, topics }: { story: Story; topics: string[] }) {
  const affinity = usePrefs((p) => p.affinity)
  const interests = usePrefs((p) => p.interests)
  const why = useMemo(() => rowReason(storyFeatures({ ...story, topics }), affinity), [story, topics, affinity])
  if (!why) return null
  const name = featureLabel(why.key, interests).name
  return <p className="mt-1 text-[0.8125rem] text-ink-3">{why.up ? <>Up for you: you like {name}</> : <>Down for you: you voted down {name}</>}</p>
}
