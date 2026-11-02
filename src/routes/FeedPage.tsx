import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { channelId as toChannelId } from '../lib/channelId'
import { Link, useParams, useSearchParams } from 'react-router'
import { ChannelBrief } from '../components/ChannelBrief'
import { FeedHeader } from '../components/FeedHeader'
import { FeedEmpty, FeedFailed } from '../components/FeedState'
import { OutageBanner } from '../components/OutageWatch'
import { Split, useListKeys } from '../components/Split'
import { RowSkeleton, StoryRow } from '../components/StoryRow'
import { TypesetLoader } from '../components/pretext/TypesetLoader'
import { BoardContext, useBoard } from '../lib/boards'
import { usePullToRefresh } from '../lib/gestures'
import { useChannelFeed, useNow } from '../lib/hooks'
import { usePretext, useTypesetIn } from '../lib/pretext'
import { kindOf, type SortMode } from '../lib/rank'
import { useActivity, usePrefs } from '../lib/store'
import type { SourceKind } from '../lib/types'

const PAGE = 50
/** Rows rendered straight away when a list changes: a screen and a bit. The rest follow a frame later. */
const FIRST = 10
// Topics where a provider outage is news.
const OUTAGE_CHANNELS = new Set(['sre', 'observability', 'cloud-native', 'for-you'])

export function FeedPage() {
  const { channel: channelParam, actor, did: boardDid, rkey: boardRkey, itemKey } = useParams()
  // A profile (/u/<handle>) is a channel too: what that person lists on PaperWing. So is a community board (/c/<owner>/<id>).
  const channelId = actor ? toChannelId({ kind: 'person', actor }) : boardDid && boardRkey ? toChannelId({ kind: 'board', did: boardDid, rkey: boardRkey }) : (channelParam ?? 'for-you')
  const [params, setParams] = useSearchParams()
  const hideRead = usePrefs((p) => p.hideRead)
  const feedOrder = usePrefs((p) => p.feedOrder)
  const variant = params.get('v') ?? undefined
  // Your default order (Settings, Tuning) unless the address picks one.
  const defaultSort: SortMode = feedOrder === 'latest' ? 'new' : 'hot'
  const sort = (params.get('sort') as SortMode | null) ?? defaultSort
  const sourceFilter = (params.get('src') as SourceKind | null) ?? undefined
  const kindFilter = (['shared', 'discussions'] as const).find((k) => k === params.get('kind'))
  const feed = useChannelFeed(channelId, { variant, sort })
  const channel = feed.channel
  const read = useActivity((s) => s.read)
  const now = useNow()
  const [limit, setLimit] = useState(PAGE)
  const base = actor ? `/u/${actor}` : boardDid && boardRkey ? `/c/${boardDid}/${boardRkey}` : `/t/${channelId}`
  // On a board, the reading pane offers its moderators their actions.
  const { data: boardView } = useBoard(channel?.board?.did, channel?.board?.rkey)

  useEffect(() => {
    setLimit(PAGE)
    document.getElementById('list-scroll')?.scrollTo({ top: 0 })
  }, [channelId, variant, sort, sourceFilter, kindFilter])

  useEffect(() => {
    document.title = channel ? `${channel.label} – PaperWing` : 'PaperWing'
  }, [channel])

  const visible = useMemo(
    () => feed.stories.filter((s) => (!sourceFilter || s.source === sourceFilter) && (!kindFilter || kindOf(s) === kindFilter) && (!hideRead || !read[s.key] || s.key === itemKey)),
    // `read` changes on every open; only re-filter for it when hiding read items.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feed.stories, sourceFilter, kindFilter, hideRead, hideRead ? read : null, itemKey],
  )
  const { cursor, open } = useListKeys(visible, itemKey, base, feed.refetch)

  // A new list (another channel, sort or filter) paints its first screen of rows at once and the
  // rest just after, in an interruptible render, so a tap on Hot, Latest or Top answers straight
  // away instead of waiting on fifty rows nobody can see yet.
  const listKey = `${channelId}|${variant}|${sort}|${sourceFilter}|${kindFilter}`
  const [eager, setEager] = useState({ key: listKey, rows: FIRST })
  if (eager.key !== listKey) setEager({ key: listKey, rows: FIRST })
  const rendered = Math.min(limit, eager.key === listKey ? eager.rows : FIRST)
  useEffect(() => {
    if (eager.rows === Infinity) return
    let timer = 0
    const raf = requestAnimationFrame(() => {
      timer = window.setTimeout(() => startTransition(() => setEager((e) => (e.key === eager.key ? { ...e, rows: Infinity } : e))))
    })
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [eager])
  // Pretext motion: arriving at a feed, or changing its sort or filters, settles its headlines in.
  const pretext = usePretext()
  useTypesetIn(`${channelId}|${variant}|${sort}|${sourceFilter}|${kindFilter}`, pretext && visible.length > 0 && !itemKey)
  const ptr = usePullToRefresh(feed.refetch, !itemKey)

  // React Router hands a functional update the params of the last render, so two changes before
  // the next render (a source, then a kind, in the filter sheet) would drop the first. Build on
  // whatever is pending instead.
  const pending = useRef<URLSearchParams | null>(null)
  useEffect(() => {
    pending.current = null
  }, [params])
  const setParam = (key: string, value?: string) => {
    const p = new URLSearchParams(pending.current ?? params)
    if (value) p.set(key, value)
    else p.delete(key)
    pending.current = p
    setParams(p, { replace: true })
  }

  if (!channel) {
    return (
      <div className="wide-col grid place-items-center p-10 text-center">
        <div>
          <p className="text-[1.375rem] font-bold">There is no channel called {channelId}</p>
          <Link className="btn mt-4" to="/topics">
            Browse topics
          </Link>
        </div>
      </div>
    )
  }

  const allFailed = feed.statuses.length > 0 && feed.statuses.every((s) => s.status === 'error')

  return (
    <BoardContext.Provider value={channel.board ? boardView : undefined}>
      <Split
        base={base}
        itemKey={itemKey}
        idle={<ChannelBrief channel={channel} stories={feed.stories} statuses={feed.statuses} onOpen={(k) => open(k)} now={now} />}
        list={
          <>
            <div ref={ptr} className="ptr" aria-hidden>
              <span className="ptr-pull">Pull to refresh</span>
              <span className="ptr-release">Release to refresh</span>
            </div>
            <FeedHeader
              channel={channel}
              stories={feed.stories}
              statuses={feed.statuses}
              sort={sort}
              onSort={(s) => setParam('sort', s === defaultSort ? undefined : s)}
              variant={channel.variant}
              onVariant={(v) => setParam('v', v)}
              sourceFilter={sourceFilter}
              onSourceFilter={(s) => setParam('src', s)}
              kindFilter={kindFilter}
              onKindFilter={(k) => setParam('kind', k)}
              fetching={feed.fetching}
              onRefresh={feed.refetch}
            />
            {OUTAGE_CHANNELS.has(channel.id) && <OutageBanner />}
            <div role="feed" aria-busy={feed.loading}>
              {feed.loading && !visible.length && pretext && <TypesetLoader label={channel.label} />}
              {feed.loading && !visible.length && Array.from({ length: pretext ? 4 : 8 }, (_, i) => <RowSkeleton key={i} />)}
              {visible.slice(0, rendered).map((s) => (
                <StoryRow key={s.key} story={s} selected={s.key === (itemKey ?? cursor)} read={!!read[s.key] && s.key !== itemKey} onOpen={open} now={now} />
              ))}
            </div>
            {allFailed && <FeedFailed offline={!navigator.onLine} statuses={feed.statuses} onRetry={() => void feed.refetch()} />}
            {channel.empty && !channel.feeds.length && (
              <div className="px-6 py-16 text-center">
                <p className="text-[1.125rem] font-bold">{channel.empty.title}</p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-ink-3">{channel.empty.body}</p>
                {channel.empty.action && (
                  <Link className="btn mt-5 inline-flex" to={channel.empty.action.to}>
                    {channel.empty.action.label}
                  </Link>
                )}
              </div>
            )}
            {!feed.loading && !allFailed && !channel.empty && !visible.length && (
              <FeedEmpty
                quiet={channel.quiet}
                filtered={!!(sourceFilter || kindFilter)}
                allRead={hideRead && feed.stories.length > 0 && !sourceFilter && !kindFilter}
                related={channel.related}
                onClearFilter={() =>
                  setParams((p) => {
                    p.delete('src')
                    p.delete('kind')
                    return p
                  })
                }
                onRefresh={() => void feed.refetch()}
              />
            )}
            {visible.length > limit && (
              <div className="p-5 text-center">
                <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
                  Show more ({visible.length - limit} left)
                </button>
              </div>
            )}
            {visible.length > 0 && visible.length <= limit && (
              <p className="py-10 text-center text-[0.875rem] text-ink-3">
                That is all <span className="num">{visible.length}</span> {visible.length === 1 ? 'story' : 'stories'} in this feed.
              </p>
            )}
          </>
        }
      />
    </BoardContext.Provider>
  )
}
