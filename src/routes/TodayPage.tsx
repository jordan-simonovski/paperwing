import { Bell, Check, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { FeedFailed } from '../components/FeedState'
import { OutageBanner } from '../components/OutageWatch'
import { Pip } from '../components/Pip'
import { Split, useListKeys } from '../components/Split'
import { usePretext, useTypesetIn } from '../lib/pretext'
import { RowSkeleton, StoryRow } from '../components/StoryRow'
import { findTopic } from '../lib/channels'
import { buildEdition, localDay, readyForEdition, useEdition, type Edition } from '../lib/edition'
import { useChannelFeed, useNow } from '../lib/hooks'
import { stateOf, totalComments, useLibrary } from '../lib/library'
import { pushAvailable, usePush } from '../lib/push'
import type { Ranked } from '../lib/rank'
import { useActivity, usePrefs } from '../lib/store'
import { topicsForStory } from '../lib/topics'
import { isWatching, useWatch } from '../lib/watch'

const dateLine = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

/** New replies in watched threads and new comments on saved stories: worth knowing before the news. */
function SinceYouWereHere() {
  const replies = useWatch((w) => Object.values(w.items).reduce((n, x) => n + (isWatching(x) ? (x.fresh ?? 0) : 0), 0))
  const savedNews = useLibrary((l) => Object.values(l.items).filter((m) => stateOf(m) === 'queue' && m.latest && totalComments(m.latest.discussions) > totalComments(m.seen)).length)
  if (!replies && !savedNews) return null
  return (
    <div className="mx-4 mt-3 flex flex-wrap gap-2 md:mx-5">
      {replies > 0 && (
        <Link to="/saved?view=watching" className="chip h-9 px-3.5">
          <span className="dot" /> {replies} new {replies === 1 ? 'reply' : 'replies'} in threads you watch
        </Link>
      )}
      {savedNews > 0 && (
        <Link to="/saved" className="chip h-9 px-3.5">
          <span className="dot" /> {savedNews} saved {savedNews === 1 ? 'story has' : 'stories have'} new comments
        </Link>
      )}
    </div>
  )
}

function PushOffer() {
  const { subscribed, subscribe } = usePush()
  const [available, setAvailable] = useState(false)
  useEffect(() => void pushAvailable().then(setAvailable), [])
  if (!available || subscribed) return null
  return (
    <button className="btn mt-4" onClick={() => void subscribe()}>
      <Bell size={15} /> Tell me when the next edition is ready
    </button>
  )
}

export function TodayPage() {
  const { itemKey } = useParams()
  const followed = usePrefs((p) => p.followed)
  const interests = usePrefs((p) => p.interests)
  const read = useActivity((s) => s.read)
  const hidden = useActivity((s) => s.hidden)
  const savedItems = useLibrary((l) => l.items)
  const { current, set, finish } = useEdition()
  const now = useNow()
  // The same For you as its own page: one module decides what it contains.
  const feed = useChannelFeed('for-you', { sort: 'hot' })
  const settled = readyForEdition(feed.statuses)
  const allFailed = feed.statuses.length > 0 && feed.statuses.every((s) => s.status === 'error')

  // A new edition once a day, picked from what's appeared since the last one.
  const stale = !current || current.day !== localDay(now)
  useEffect(() => {
    document.title = 'Today – PaperWing'
  }, [])
  const anyStories = feed.stories.length > 0
  useEffect(() => {
    if (!stale || !settled || !anyStories) return
    const since = current?.createdAt ?? now - 24 * 3_600_000
    const sections = buildEdition(feed.stories, { followed, since, exclude: (k) => !!read[k] || !!hidden[k] || !!savedItems[k], now })
    set({ day: localDay(now), createdAt: now, since, sections })
    // Only the day boundary or a finished load should start a new edition. A load that failed
    // finishes with nothing, so stories arriving later (a retry, the connection coming back) count too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale, settled, anyStories])

  const edition: Edition | undefined = stale ? undefined : current
  const stories = useMemo<Ranked[]>(() => (edition?.sections ?? []).flatMap((sec) => sec.stories.map((s) => ({ alsoOn: [], ...s, heat: 0.5, topics: topicsForStory(s) }))), [edition])
  const { cursor, open } = useListKeys(stories, itemKey, '/today')
  // Pretext motion: each edition's headlines settle in when you arrive.
  const pretext = usePretext()
  useTypesetIn(`today|${edition?.createdAt ?? ''}`, pretext && stories.length > 0 && !itemKey)
  const done = stories.filter((s) => read[s.key]).length
  const finished = !!edition?.finishedAt || (stories.length > 0 && done === stories.length)
  // Pip settles in only when you finish while you're here, not every time you come back to a finished edition.
  const state = edition ? finished : undefined
  const [lastState, setLastState] = useState(state)
  const [justFinished, setJustFinished] = useState(false)
  if (state !== lastState) {
    setLastState(state)
    setJustFinished(lastState === false && state === true)
  }

  const restart = () => {
    const sections = buildEdition(feed.stories, { followed, since: edition?.createdAt ?? now, exclude: (k) => !!read[k] || !!hidden[k] || !!savedItems[k], now })
    set({ day: localDay(now), createdAt: now, since: edition?.createdAt ?? now, sections })
  }

  return (
    <Split
      base="/today"
      itemKey={itemKey}
      idle={
        <div className="grid h-full place-items-center p-10 text-center">
          <div className="max-w-sm">
            <p className="text-[1.375rem] font-bold">One edition a day</p>
            <p className="mt-2 text-[0.9375rem] text-ink-3">The best of your topics since the last one, picked so every topic gets a say, and short enough to finish.</p>
          </div>
        </div>
      }
      list={
        <>
          <header className="px-3 pt-3 md:px-4 md:pt-4">
            <div className="field field-ink px-5 pb-5 pt-5">
              <p className="text-[0.9375rem] font-semibold opacity-80">{dateLine(edition?.createdAt ?? now)}</p>
              <h1 className="mt-1 text-[1.875rem] font-bold leading-[1.1] tracking-[-0.02em]">Today</h1>
              <p className="mt-2 text-[0.9375rem] opacity-85">
                {edition ? (
                  <>
                    <span className="num">{stories.length}</span> stories from your topics. <span className="num">{done}</span> read.
                  </>
                ) : (
                  'Putting your edition together…'
                )}
              </p>
              {edition && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: 'color-mix(in oklch, currentColor 18%, transparent)' }} aria-hidden>
                  <div className="h-full rounded-full bg-signal transition-[width] duration-300" style={{ width: `${(done / Math.max(1, stories.length)) * 100}%` }} />
                </div>
              )}
            </div>
          </header>
          <OutageBanner />
          <SinceYouWereHere />

          {!edition && allFailed && <FeedFailed offline={!navigator.onLine} statuses={feed.statuses} onRetry={() => void feed.refetch()} />}
          {!edition && !allFailed && Array.from({ length: 6 }, (_, i) => <RowSkeleton key={i} />)}
          {edition?.sections.map((sec, i) => {
            const topic = sec.topic ? findTopic(sec.topic, interests) : undefined
            return (
              <section key={sec.topic ?? `rest-${i}`} className="mt-5">
                <h2 className="mb-1 flex items-center gap-2 px-4 text-[0.9375rem] font-bold md:px-5">
                  {topic ? (
                    <Link to={`/t/${topic.id}`} className="inline-flex items-center gap-2 hover:underline">
                      <span className="topic swatch" style={{ '--h': topic.hue } as React.CSSProperties} />
                      {topic.label}
                    </Link>
                  ) : (
                    'Also worth a look'
                  )}
                </h2>
                {sec.stories.map((s) => {
                  const r = stories.find((x) => x.key === s.key)!
                  return <StoryRow key={s.key} story={r} selected={s.key === (itemKey ?? cursor)} read={!!read[s.key] && s.key !== itemKey} onOpen={open} now={now} level={3} />
                })}
              </section>
            )
          })}

          {edition && (
            <div className="mx-4 my-8 rounded-[18px] bg-panel p-6 text-center md:mx-5">
              {finished ? (
                <>
                  <Pip variant="done" className={`mx-auto block size-28 ${justFinished && pretext ? 'pip-settle' : ''}`} />
                  <p className="mt-1 text-[1.25rem] font-bold">You're caught up</p>
                  <p className="mt-1 text-[0.9375rem] text-ink-3">The next edition is ready tomorrow. For more now, For you never ends.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Link to="/t/for-you" className="btn">
                      Go to For you
                    </Link>
                    <button className="btn" onClick={restart}>
                      <RotateCcw size={15} /> Fresh edition now
                    </button>
                  </div>
                  <PushOffer />
                </>
              ) : (
                <>
                  <p className="text-[1rem] font-semibold">That's the edition</p>
                  <p className="mt-1 text-[0.9375rem] text-ink-3">Skimmed what you wanted? Close it out; anything unread stays in For you.</p>
                  <button className="btn btn-primary mt-4" onClick={finish}>
                    <Check size={15} /> Done for today
                  </button>
                </>
              )}
            </div>
          )}
        </>
      }
    />
  )
}
