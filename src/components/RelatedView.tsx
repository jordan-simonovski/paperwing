import { useMemo } from 'react'
import { findTopic } from '../lib/channels'
import { usePrefs } from '../lib/store'
import { tasteKeys } from './StoryRow'
import { ago, compact } from '../lib/format'
import { indexedStories, indexStory, useDiscussions } from '../lib/hooks'
import { useOutlets } from '../lib/coverage'
import { hiringEmployer } from '../lib/employers'
import { canonicalUrl } from '../lib/rank'
import { relatedTopics, topicsForStory } from '../lib/topics'
import type { Story } from '../lib/types'
import { scoreUnit, sourceLabel } from './Source'
import { StoryIcon } from './SourceIcon'
import { StillHiring } from './StillHiring'
import { TopicChip } from './TopicTag'

const STOP = new Set(
  'the a an and or of to in on for with is are was be by at from as it its this that how why what your you we our my i new using use via vs into over can not no more than about after'.split(' '),
)
const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )

/** "More like this / fewer like this", per topic and per site, with where each stands now. */
function Tune({ story }: { story: Story }) {
  const { affinity, nudge, interests } = usePrefs()
  const keys = tasteKeys(story)
  if (!keys.length) return null
  const label = (k: string) => (k.startsWith('t:') ? (findTopic(k.slice(2), interests)?.label ?? k.slice(2)) : k.slice(2))
  return (
    <section>
      <h2 className="label mb-2">Tune your feeds</h2>
      <div className="space-y-1.5">
        {keys.map((k) => {
          const v = affinity[k] ?? 0
          return (
            <div key={k} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-[0.9375rem]">
                {k.startsWith('d:') ? 'From ' : ''}
                <span className="font-semibold">{label(k)}</span>
                {v !== 0 && <span className="ml-2 text-[0.8125rem] text-ink-3">{v > 0 ? 'showing more' : 'showing fewer'}</span>}
              </span>
              <button className={`chip h-8 px-3 ${v < 0 ? 'on' : ''}`} onClick={() => nudge([k], -1)} disabled={v <= -3}>
                Fewer
              </button>
              <button className={`chip h-8 px-3 ${v > 0 ? 'on' : ''}`} onClick={() => nudge([k], 1)} disabled={v >= 3}>
                More
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function MiniRow({ s, onOpen, now }: { s: Story; onOpen: (key: string) => void; now: number }) {
  return (
    <button className="flex w-full items-start gap-4 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-sunk" onClick={() => onOpen(s.key)}>
      <span className="min-w-0 flex-1">
        <span className="block text-[1rem] font-semibold leading-snug">{s.title}</span>
        <span className="meta mt-0.5">
          <span className="inline-flex items-center gap-1.5 self-center font-semibold text-ink-2">
            <StoryIcon story={s} size={13} />
            {sourceLabel(s)}
          </span>
          {!!s.score && (
            <span className="num">
              {compact(s.score)} {scoreUnit(s.source, s.score)}
            </span>
          )}
          <span>{ago(s.createdAt, now)}</span>
        </span>
      </span>
      {s.hasThread && (
        <span className="num flex-none text-right text-[1rem] font-bold">
          {compact(s.comments ?? 0)}
          <span className="block text-[0.75rem] font-normal text-ink-3">comments</span>
        </span>
      )}
    </button>
  )
}

/** Other threads about the same link, found by URL on HN. */
export function Elsewhere({ story, onOpen, now, alsoOn = [] }: { story: Story; onOpen: (key: string) => void; now: number; alsoOn?: Story[] }) {
  const found = useDiscussions(story.url)
  const list = useMemo(() => {
    const seen = new Set([story.key])
    const out: Story[] = []
    for (const s of [...alsoOn, ...(found.data ?? [])]) {
      if (seen.has(s.key) || !s.hasThread) continue
      seen.add(s.key)
      out.push(s)
    }
    return out
  }, [found.data, alsoOn, story.key])

  if (!story.url) return null
  if (found.isPending && !list.length) return <div className="skel my-3 h-12" />
  if (!list.length) return <p className="py-3 text-[0.9375rem] text-ink-3">Nobody on Hacker News is discussing this link yet.</p>
  return (
    <div>
      {list.map((s) => (
        <MiniRow key={s.key} s={s} onOpen={onOpen} now={now} />
      ))}
    </div>
  )
}

export function RelatedView({ story, onOpen, now, alsoOn, coverage = [] }: { story: Story; onOpen: (key: string) => void; now: number; alsoOn?: Story[]; coverage?: Story[] }) {
  const topics = useMemo(() => topicsForStory(story), [story])
  const near = useMemo(() => relatedTopics(topics).slice(0, 5), [topics])
  const similar = useMemo(() => {
    const mine = tokens(story.title)
    const link = story.url ? canonicalUrl(story.url) : undefined
    return indexedStories()
      .filter((s) => s.key !== story.key && (!link || !s.url || canonicalUrl(s.url) !== link))
      .map((s) => {
        const theirs = tokens(s.title)
        let overlap = 0
        for (const w of theirs) if (mine.has(w)) overlap++
        const sharedTopics = s.topics.filter((t) => topics.includes(t)).length
        return { s, score: overlap / Math.sqrt(mine.size * theirs.size || 1) + sharedTopics * 0.12 }
      })
      .filter((x) => x.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.s)
  }, [story, topics])

  // Coverage the feed already grouped, plus what a news search finds (only for stories that are news).
  const { stories: allCoverage, outlets: total, searching } = useOutlets(story, coverage)
  const outlets = total - 1
  // A story about one employer's layoffs: what that employer is still hiring for.
  const hiring = useMemo(() => hiringEmployer(story.title), [story.title])

  return (
    <div className="mx-auto max-w-[44rem] space-y-9 py-7">
      {allCoverage.length > 0 && (
        <section id="coverage">
          <h2 className="label mb-1">How it’s being covered</h2>
          <p className="mb-2 text-[0.8125rem] text-ink-3">
            {outlets === 1 ? 'One other outlet' : `${outlets} other outlets`}, side by side. Found by searching the news for this headline’s names and places.
          </p>
          <div className="-mx-3">
            {allCoverage.map((s) => (
              <MiniRow
                key={s.key}
                s={s}
                onOpen={(k) => {
                  indexStory(s)
                  onOpen(k)
                }}
                now={now}
              />
            ))}
          </div>
        </section>
      )}
      {searching && !allCoverage.length && <p className="text-[0.8125rem] text-ink-3">Looking for other outlets’ coverage…</p>}
      {hiring && <StillHiring employer={hiring.name} now={now} />}
      <Tune story={story} />
      {story.url && (
        <section>
          <h2 className="label mb-2">Discussed elsewhere</h2>
          <Elsewhere story={story} onOpen={onOpen} now={now} alsoOn={alsoOn} />
        </section>
      )}
      {(topics.length > 0 || near.length > 0) && (
        <section>
          <h2 className="label mb-3">Topics</h2>
          <div className="flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <TopicChip key={t} id={t} />
            ))}
          </div>
          {near.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[0.8125rem] font-semibold text-ink-3">Related</span>
              {near.map((t) => (
                <TopicChip key={t.id} id={t.id} />
              ))}
            </div>
          )}
        </section>
      )}
      <section>
        <h2 className="label mb-2">Similar stories you've loaded</h2>
        {similar.length ? (
          similar.map((s) => <MiniRow key={s.key} s={s} onOpen={onOpen} now={now} />)
        ) : (
          <p className="py-3 text-[0.9375rem] text-ink-3">Nothing similar in the feeds you've opened this session.</p>
        )}
      </section>
    </div>
  )
}
