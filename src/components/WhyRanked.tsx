import { useMemo } from 'react'
import { reasons, storyFeatures } from '../lib/features'
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
