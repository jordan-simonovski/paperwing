import { QueueCleared } from '../components/FeedState'
import { SaveFromClipboardButton } from '../components/SaveFromApps'
import { usePretext } from '../lib/pretext'
import { Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { SOURCE_NAMES } from '../components/Source'
import { Split, useListKeys } from '../components/Split'
import { StoryRow, toggleArchived, toggleSaved, toggleWatch } from '../components/StoryRow'
import { useNow } from '../lib/hooks'
import { stateOf, totalComments, useLibrary, type SavedMeta, type SavedState } from '../lib/library'
import type { Ranked } from '../lib/rank'
import { useActivity } from '../lib/store'
import { topicsForStory } from '../lib/topics'
import { isWatching, useWatch, type Watched } from '../lib/watch'

type Sort = 'newest' | 'oldest' | 'shortest'

const plain = (html = '') =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()

function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** What changed in a saved story's discussions since you last looked. */
function changes(m: SavedMeta) {
  if (!m.latest) return { newComments: 0, newPlaces: [] as string[] }
  const seen = new Set((m.seen ?? []).map((d) => d.key))
  const newPlaces = [...new Set(m.latest.discussions.filter((d) => !seen.has(d.key) && d.key !== m.story.key).map((d) => SOURCE_NAMES[d.source]))]
  return {
    newComments: Math.max(0, totalComments(m.latest.discussions) - totalComments(m.seen)),
    newPlaces,
  }
}

function SavedNote({ m }: { m: SavedMeta }) {
  const { newComments, newPlaces } = changes(m)
  const progress = m.progress ?? 0
  if (!m.minutes && !progress && !newComments && !newPlaces.length && !m.hollow) return null
  return (
    <div className="meta mt-1.5">
      {m.hollow && <span>Fetching for offline…</span>}
      {m.minutes && <span>{m.minutes} min read</span>}
      {progress > 0.03 && (
        <span className="inline-flex items-center gap-1.5">
          <span className="progress" style={{ '--p': progress } as React.CSSProperties} aria-hidden />
          {progress > 0.96 ? 'Read' : `${Math.round(progress * 100)}% read`}
        </span>
      )}
      {newComments > 0 && (
        <span className="font-semibold text-signal">
          {newComments} new {newComments === 1 ? 'comment' : 'comments'}
        </span>
      )}
      {newPlaces.length > 0 && <span className="font-semibold text-signal">Now on {newPlaces.join(', ')}</span>}
    </div>
  )
}

function WatchNote({ w, now }: { w: Watched; now: number }) {
  const quiet = now - w.lookedAt > 30 * 86_400_000
  return (
    <div className="meta mt-1.5">
      {(w.fresh ?? 0) > 0 ? (
        <span className="font-semibold text-signal">
          {w.fresh} new {w.fresh === 1 ? 'reply' : 'replies'} since you looked
        </span>
      ) : (
        <span>{quiet ? 'Quiet for a month, no longer checked' : 'No new replies'}</span>
      )}
      <span>Looked {Math.round((now - w.lookedAt) / 3_600_000) < 1 ? 'just now' : `${formatAgo(now - w.lookedAt)} ago`}</span>
    </div>
  )
}

const formatAgo = (ms: number) => (ms < 86_400_000 ? `${Math.round(ms / 3_600_000)}h` : `${Math.round(ms / 86_400_000)}d`)

export function SavedPage() {
  const { itemKey } = useParams()
  const [params, setParams] = useSearchParams()
  const view: SavedState | 'watching' = params.get('view') === 'archive' ? 'archive' : params.get('view') === 'watching' ? 'watching' : 'queue'
  const sort: Sort = (['oldest', 'shortest'] as const).find((s) => s === params.get('sort')) ?? 'newest'
  const items = useLibrary((s) => s.items)
  const ready = useLibrary((s) => s.ready)
  const read = useActivity((s) => s.read)
  const now = useNow()
  const [usage, setUsage] = useState<string>()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState<Map<string, string>>()

  useEffect(() => {
    document.title = 'Saved – PaperWing'
    navigator.storage?.estimate?.().then((e) => e.usage && setUsage(`${(e.usage / 1_048_576).toFixed(1)} MB on this device`))
  }, [items])

  // Check saved stories' discussions and fill in anything imported or synced without its article.
  useEffect(() => {
    if (!ready) return
    const lib = useLibrary.getState()
    const run = () => void lib.refresh().then(() => lib.hydrate())
    run()
    window.addEventListener('online', run)
    return () => window.removeEventListener('online', run)
  }, [ready])

  // Full-text search reads the saved articles themselves, built once the box is used.
  const searching = query.trim().length >= 2
  useEffect(() => {
    if (!searching || !ready) return
    let cancelled = false
    void useLibrary
      .getState()
      .all()
      .then((all) => {
        if (!cancelled) setIndex(new Map(all.map((i) => [i.story.key, `${i.story.title} ${i.story.author ?? ''} ${i.story.url ?? ''} ${plain(i.article?.html)} ${plain(i.story.text)}`.toLowerCase()])))
      })
    return () => {
      cancelled = true
    }
  }, [searching, ready, items])

  const watchItems = useWatch((w) => w.items)
  const watched = useMemo(
    () =>
      Object.values(watchItems)
        .filter(isWatching)
        .sort((a, b) => (b.fresh ?? 0) - (a.fresh ?? 0) || b.lookedAt - a.lookedAt),
    [watchItems],
  )
  useEffect(() => {
    if (view === 'watching') void useWatch.getState().check({ maxAgeMs: 60_000 })
  }, [view])

  const counts = useMemo(() => {
    const all = Object.values(items)
    const queue = all.filter((m) => stateOf(m) === 'queue')
    return {
      queue: queue.length,
      archive: all.length - queue.length,
      minutes: queue.reduce((n, m) => n + (m.minutes ?? 0), 0),
    }
  }, [items])

  const stories = useMemo<(Ranked & { meta: SavedMeta })[]>(() => {
    const terms = searching ? query.toLowerCase().split(/\s+/).filter(Boolean) : []
    return Object.values(items)
      .filter((m) => (searching ? true : stateOf(m) === view))
      .filter((m) => !terms.length || (index && terms.every((t) => index.get(m.story.key)?.includes(t))))
      .sort((a, b) =>
        sort === 'oldest'
          ? a.savedAt - b.savedAt
          : sort === 'shortest'
            ? (a.minutes ?? 999) - (b.minutes ?? 999) || b.savedAt - a.savedAt
            : view === 'archive' && !searching
              ? (b.archivedAt ?? 0) - (a.archivedAt ?? 0)
              : b.savedAt - a.savedAt,
      )
      .map((m) => ({
        ...m.story,
        heat: 0.6,
        alsoOn: [],
        topics: topicsForStory(m.story),
        meta: m,
      }))
  }, [items, view, sort, searching, query, index])
  const watchRows = useMemo(
    () =>
      watched.map((w) => ({
        ...w.story,
        comments: w.total ?? w.story.comments,
        heat: 0.6,
        alsoOn: [],
        topics: topicsForStory(w.story),
        watch: w,
      })),
    [watched],
  )
  // Pip hops only when the queue empties while you're here, not every time you come back to an empty one.
  const pretext = usePretext()
  const [lastQueue, setLastQueue] = useState(counts.queue)
  const [justCleared, setJustCleared] = useState(false)
  if (ready && counts.queue !== lastQueue) {
    setLastQueue(counts.queue)
    setJustCleared(lastQueue > 0 && counts.queue === 0)
  }
  const listed = view === 'watching' && !searching ? watchRows : stories
  const { cursor, open } = useListKeys(listed, itemKey, '/saved')

  const setParam = (key: string, value?: string) =>
    setParams(
      (p) => {
        if (value) p.set(key, value)
        else p.delete(key)
        return p
      },
      { replace: true },
    )

  return (
    <Split
      base="/saved"
      itemKey={itemKey}
      idle={
        <div className="grid h-full place-items-center p-10 text-center">
          <div className="max-w-sm">
            <p className="text-[1.375rem] font-bold">Read it later, with the conversation</p>
            <p className="mt-2 text-[0.9375rem] text-ink-3">
              Saved stories keep their article, images and comments on this device. When people keep talking about them, here or somewhere new, the list tells you.
            </p>
          </div>
        </div>
      }
      list={
        <>
          <header className="px-3 pt-3 md:px-4 md:pt-4">
            <div className="field px-5 pb-4 pt-5">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-[1.75rem] font-bold leading-[1.1] tracking-[-0.02em]">Saved</h1>
                <SaveFromClipboardButton className="btn h-9 flex-none bg-ground px-3.5 text-[0.875rem]" />
              </div>
              <p className="mt-1.5 text-[0.9375rem] opacity-85">
                <span className="num">{counts.queue}</span> in your queue
                {counts.minutes > 0 && <>, about {duration(counts.minutes)} of reading</>}
                {usage ? `. ${usage}` : ''}
              </p>
              <label className="relative mt-3.5 block">
                <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search the text of everything you've saved"
                  className="h-10 w-full rounded-full bg-ground pl-10 pr-10 text-[0.9375rem] placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
                  aria-label="Search saved stories"
                />
                {query && (
                  <button className="icon-btn absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2" onClick={() => setQuery('')} aria-label="Clear search">
                    <X size={15} />
                  </button>
                )}
              </label>
            </div>
          </header>

          <div className="sticky-head flex items-center gap-2 py-2.5 pl-4 pr-3 md:pl-5">
            {searching ? (
              <p className="flex-1 text-[0.875rem] font-semibold text-ink-2">
                <span className="num">{stories.length}</span> {stories.length === 1 ? 'match' : 'matches'} in your queue and archive
              </p>
            ) : (
              <div className="seg flex-none" role="group" aria-label="Queue or archive">
                <button aria-pressed={view === 'queue'} onClick={() => setParam('view', undefined)}>
                  Queue <span className="num ml-1 font-normal text-ink-3">{counts.queue}</span>
                </button>
                <button aria-pressed={view === 'archive'} onClick={() => setParam('view', 'archive')}>
                  Archive <span className="num ml-1 font-normal text-ink-3">{counts.archive}</span>
                </button>
                <button aria-pressed={view === 'watching'} onClick={() => setParam('view', 'watching')}>
                  Watching <span className="num ml-1 font-normal text-ink-3">{watched.length}</span>
                  {watched.some((w) => (w.fresh ?? 0) > 0) && <span className="dot ml-1.5" aria-label="New replies" />}
                </button>
              </div>
            )}
            <select
              className="ml-auto h-8 rounded-full bg-sunk px-3 text-[0.8125rem] font-semibold text-ink-2"
              value={sort}
              onChange={(e) => setParam('sort', e.target.value === 'newest' ? undefined : e.target.value)}
              aria-label="Sort saved stories"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="shortest">Shortest</option>
            </select>
          </div>

          {view === 'watching' && !searching && (
            <div>
              {watchRows.map((s) => (
                <StoryRow
                  key={s.key}
                  story={s}
                  selected={s.key === (itemKey ?? cursor)}
                  read={!s.watch.fresh && s.key !== itemKey}
                  onOpen={(k) => open(k, 'discussion')}
                  now={now}
                  note={<WatchNote w={s.watch} now={now} />}
                  swipe={{
                    right: ['Stop watching', () => toggleWatch(s)],
                    left: ['Stop watching', () => toggleWatch(s)],
                  }}
                />
              ))}
              {!watchRows.length && (
                <p className="px-6 py-16 text-center text-ink-3">
                  Not watching any threads. Open a discussion and tap the bell, or press <kbd>w</kbd>, to follow its replies here.
                </p>
              )}
            </div>
          )}
          {!(view === 'watching' && !searching) && (
            <div>
              {stories.map((s) => (
                <StoryRow
                  key={s.key}
                  story={s}
                  selected={s.key === (itemKey ?? cursor)}
                  read={stateOf(s.meta) === 'archive' || (!!read[s.key] && s.key !== itemKey && (s.meta.progress ?? 0) > 0.96)}
                  onOpen={(k, tab) => open(k, tab ?? (s.url ? 'article' : 'discussion'))}
                  now={now}
                  note={<SavedNote m={s.meta} />}
                  swipe={{
                    right: [stateOf(s.meta) === 'queue' ? 'Archive' : 'Back to queue', () => void toggleArchived(s)],
                    left: ['Remove', () => void toggleSaved(s)],
                  }}
                />
              ))}
            </div>
          )}
          {ready && !stories.length && view === 'queue' && !searching && counts.archive > 0 && (
            <QueueCleared archived={counts.archive} settle={justCleared && pretext} onArchive={() => setParam('view', 'archive')} />
          )}
          {ready && !stories.length && !(view === 'watching' && !searching) && !(view === 'queue' && !searching && counts.archive > 0) && (
            <p className="px-6 py-16 text-center text-ink-3">
              {searching ? (
                'Nothing you have saved mentions that.'
              ) : view === 'archive' ? (
                'Nothing archived yet. Finish a story, or press e, and it lands here.'
              ) : (
                <>
                  Your queue is empty. Press <kbd>s</kbd> on a story, tap its bookmark, or share a link into PaperWing.
                </>
              )}
            </p>
          )}
        </>
      }
    />
  )
}
