import { useQueries, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Split, useListKeys } from '../components/Split'
import { RowSkeleton, StoryRow } from '../components/StoryRow'
import { TopicChip } from '../components/TopicTag'
import { allTopics } from '../lib/channels'
import { useNow } from '../lib/hooks'
import { merge } from '../lib/rank'
import { SEARCH_SOURCES } from '../lib/search'
import { useActivity, usePrefs } from '../lib/store'
import { relatedTopics, searchTopics } from '../lib/topics'
import { clearRecentSearches, recentSearches, rememberSearch } from '../components/Palette'

const RANGES = [
  { id: 'day', label: '24h', days: 1 },
  { id: 'week', label: 'Week', days: 7 },
  { id: 'month', label: 'Month', days: 30 },
  { id: 'year', label: 'Year', days: 365 },
  { id: 'all', label: 'All time', days: undefined },
] as const

export function SearchPage() {
  const { itemKey } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const q = params.get('q') ?? ''
  const range = RANGES.find((r) => r.id === params.get('t')) ?? RANGES[2]
  const sort = params.get('sort') === 'new' ? 'new' : 'top'
  const [draft, setDraft] = useState(q)
  const { interests, followed, mutedWords, mutedDomains, addInterest } = usePrefs()
  const inputRef = useRef<HTMLInputElement>(null)
  const [recent, setRecent] = useState(recentSearches)
  const hidden = useActivity((s) => s.hidden)
  const read = useActivity((s) => s.read)
  const now = useNow()

  useEffect(() => setDraft(q), [q])
  useEffect(() => {
    document.title = q ? `${q}, search – PaperWing` : 'Search – PaperWing'
    if (q) {
      rememberSearch(q)
      setRecent(recentSearches())
    }
  }, [q])

  const topicHits = useMemo(() => searchTopics(draft, allTopics(interests)).slice(0, 3), [draft, interests])
  const near = useMemo(() => relatedTopics(topicHits.map((h) => h.topic.id)).slice(0, 6), [topicHits])

  // Every source searches at once and shows as it answers; a filter narrows to one of them.
  const qc = useQueryClient()
  const [only, setOnly] = useState<string>()
  useEffect(() => setOnly(undefined), [q])
  const results = useQueries({
    queries: SEARCH_SOURCES.map((src) => ({
      queryKey: ['search', src.id, q, range.id, sort],
      enabled: !!q,
      staleTime: src.id === 'loaded' ? 0 : 5 * 60_000,
      queryFn: () => src.run(q, { days: range.days, sort }, qc),
    })),
  })
  const stamp = results.map((r) => r.dataUpdatedAt).join()
  const counts = SEARCH_SOURCES.map((src, i) => ({ ...src, count: results[i].data?.length ?? 0, pending: results[i].isFetching, failed: results[i].isError }))
  const stories = useMemo(() => {
    // An API's copy of a story wins over the same story from a loaded feed.
    const seen = new Set<string>()
    const batches = SEARCH_SOURCES.map((src, i) => (!only || only === src.id ? (results[i].data ?? []) : [])).map((b) => b.filter((s) => !seen.has(s.key) && seen.add(s.key)))
    return merge(batches, { sort, filters: { mutedWords, mutedDomains, hidden } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, only, sort, mutedWords, mutedDomains, hidden])
  const searching = results.some((r) => r.isFetching)
  const answered = results.some((r) => r.data)
  const { cursor, open } = useListKeys(stories, itemKey, '/search')

  const setParam = (key: string, value?: string) =>
    setParams(
      (p) => {
        if (value) p.set(key, value)
        else p.delete(key)
        return p
      },
      { replace: true },
    )

  const typed = draft.trim()
  const exactTopic = topicHits.some((h) => h.score >= 7)
  const alreadyInterest = interests.some((i) => i.query.toLowerCase() === typed.toLowerCase())
  const submit = (term: string) => {
    const t = term.trim()
    if (!t) return
    setDraft(t)
    setParam('q', t)
    inputRef.current?.blur()
  }

  return (
    <Split
      base="/search"
      itemKey={itemKey}
      idle={
        <div className="grid h-full place-items-center p-10 text-center text-ink-3">
          <p className="max-w-sm text-[1.125rem] font-semibold text-ink-2">Search runs across Hacker News, Bluesky, Lemmy, Mastodon hashtags and everything in your feeds. Topics that match your words show up as you type.</p>
        </div>
      }
      list={
        <div className="px-4 pt-4 md:px-5 md:pt-6">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              submit(draft)
            }}
            className="relative"
          >
            <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              autoCapitalize="off"
              autoCorrect="off"
              autoFocus={!q}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Stories, topics, tools"
              className="h-13 w-full rounded-full bg-sunk pl-12 pr-12 text-[1.125rem] font-semibold placeholder:font-normal placeholder:text-ink-3 focus:bg-active focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              aria-label="Search"
            />
            {draft && (
              <button
                type="button"
                className="icon-btn absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => {
                  setDraft('')
                  inputRef.current?.focus()
                }}
                aria-label="Clear search"
              >
                <X size={17} />
              </button>
            )}
          </form>

          {/* Before anything is typed: somewhere to start. */}
          {!typed && !q && (
            <div className="mt-6 space-y-7">
              {recent.length > 0 && (
                <section>
                  <div className="mb-2.5 flex items-baseline justify-between">
                    <h2 className="label">Recent searches</h2>
                    <button
                      className="text-[0.8125rem] font-semibold text-ink-3 hover:text-ink"
                      onClick={() => {
                        clearRecentSearches()
                        setRecent([])
                      }}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recent.map((r) => (
                      <button key={r} className="chip" onClick={() => submit(r)}>
                        {r}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {followed.length > 0 && (
                <section>
                  <h2 className="label mb-2.5">Your topics</h2>
                  <div className="flex flex-wrap gap-1.5">
                    {followed.map((id) => (
                      <TopicChip key={id} id={id} />
                    ))}
                  </div>
                </section>
              )}
              <section>
                <h2 className="label mb-2.5">Try</h2>
                <div className="flex flex-wrap gap-1.5">
                  {['opentelemetry', 'mcp', 'postgres', 'rust', 'gpu inference'].map((t) => (
                    <button key={t} className="chip" onClick={() => submit(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* While typing: topics match live, and the search itself is one tap. */}
          {typed && (
            <section className="mt-4 space-y-2">
              {typed !== q && (
                <button className="btn btn-primary h-11 w-full justify-start px-5" onClick={() => submit(draft)}>
                  <Search size={16} /> Search stories for “{typed}”
                </button>
              )}
              {topicHits.map((h) => (
                <button key={h.topic.id} onClick={() => navigate(`/t/${h.topic.id}`)} className="field topic flex w-full items-center gap-3 px-4 py-2.5 text-left transition-[filter] hover:brightness-[0.97]" style={{ '--h': h.topic.hue } as React.CSSProperties}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{h.topic.label}</span>
                    <span className="block truncate text-[0.8125rem] opacity-80">{h.via ? `Matches “${h.via}”` : h.topic.blurb}</span>
                  </span>
                  <span className="flex-none text-[0.8125rem] font-semibold opacity-80">Open topic</span>
                </button>
              ))}
              {!exactTopic && !alreadyInterest && (
                <button
                  className="btn w-full justify-start"
                  onClick={() => {
                    const i = addInterest(typed)
                    navigate(`/t/${i.id}`)
                  }}
                >
                  <Plus size={15} /> Follow “{typed}” as an interest
                </button>
              )}
              {near.length > 0 && (
                <div className="scroll-x -mx-4 flex items-center gap-1.5 px-4 pt-1 md:-mx-5 md:px-5">
                  <span className="mr-1 flex-none text-[0.8125rem] font-semibold text-ink-3">Related</span>
                  {near.map((t) => (
                    <TopicChip key={t.id} id={t.id} small />
                  ))}
                </div>
              )}
            </section>
          )}

          {q && (
            <div className="sticky-head -mx-4 mt-5 flex flex-wrap items-center gap-1.5 px-4 py-2.5 md:-mx-5 md:px-5">
              {RANGES.map((r) => (
                <button key={r.id} className={`chip h-7 ${range.id === r.id ? 'on' : ''}`} onClick={() => setParam('t', r.id === 'month' ? undefined : r.id)}>
                  {r.label}
                </button>
              ))}
              <select className="ml-auto h-8 rounded-full bg-sunk px-3 text-[0.8125rem] font-semibold text-ink-2" value={sort} onChange={(e) => setParam('sort', e.target.value === 'new' ? 'new' : undefined)} aria-label="Sort results">
                <option value="top">Best match</option>
                <option value="new">Newest</option>
              </select>
            </div>
          )}

          {q && (
            <div className="scroll-x -mx-4 flex items-center gap-1.5 px-4 pb-2 md:-mx-5 md:px-5" role="group" aria-label="Sources">
              <button className={`chip h-7 ${!only ? 'on' : ''}`} onClick={() => setOnly(undefined)}>
                All
              </button>
              {counts
                .filter((c) => c.count || c.pending || c.failed)
                .map((c) => (
                  <button key={c.id} className={`chip h-7 ${only === c.id ? 'on' : ''}`} onClick={() => setOnly(only === c.id ? undefined : c.id)} title={c.failed ? `${c.label} search failed` : undefined}>
                    {c.label} <span className="num ml-1 opacity-70">{c.pending && !c.count ? '…' : c.failed ? '!' : c.count}</span>
                  </button>
                ))}
            </div>
          )}

          <div className="-mx-4 md:-mx-5">
            {searching && !stories.length && Array.from({ length: 6 }, (_, i) => <RowSkeleton key={i} />)}
            {stories.map((s) => (
              <StoryRow key={s.key} story={s} selected={s.key === (itemKey ?? cursor)} read={!!read[s.key] && s.key !== itemKey} onOpen={open} now={now} />
            ))}
          </div>
          {answered && !searching && !stories.length && <p className="py-14 text-center text-ink-3">No stories found{range.days ? ' in this time range' : ''}.</p>}
          {results.every((r) => r.isError) && <p className="py-4 text-center text-[0.875rem] text-ink-3">Search failed: {results[0].error?.message}</p>}
        </div>
      }
    />
  )
}
