import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ChannelBrief } from '../components/ChannelBrief'
import { FeedHeader } from '../components/FeedHeader'
import { OutageBanner } from '../components/OutageWatch'
import { Split, useListKeys } from '../components/Split'
import { RowSkeleton, StoryRow } from '../components/StoryRow'
import { TypesetLoader } from '../components/pretext/TypesetLoader'
import { resolveChannel } from '../lib/channels'
import { BoardContext, useBoard } from '../lib/boards'
import { useMastodon } from '../lib/mastodon'
import { usePullToRefresh } from '../lib/gestures'
import { useChannelFeed, useNow } from '../lib/hooks'
import { usePretext, useTypesetIn } from '../lib/pretext'
import { kindOf, type SortMode } from '../lib/rank'
import { useActivity, usePrefs } from '../lib/store'
import { canReadTimeline, useAtproto } from '../lib/atproto'
import type { SourceKind } from '../lib/types'

const PAGE = 50
// Topics where a provider outage is news.
const OUTAGE_CHANNELS = new Set(['sre', 'observability', 'cloud-native', 'for-you'])

export function FeedPage() {
  const { channel: channelParam, actor, did: boardDid, rkey: boardRkey, itemKey } = useParams()
  // A profile (/u/<handle>) is a channel too: what that person lists on PaperWing. So is a community board (/c/<owner>/<id>).
  const channelId = actor ? `u:${actor.replace(/^@/, '').toLowerCase()}` : boardDid && boardRkey ? `cb:${boardDid}:${boardRkey}` : (channelParam ?? 'for-you')
  const [params, setParams] = useSearchParams()
  const { followed, interests, customFeeds, bskyFeeds, communities, mixes, followedMixes, people, boards, releaseRepos, hideRead, statusPages, feedOrder } = usePrefs()
  const statusHosts = useMemo(() => statusPages.map((p) => p.host), [statusPages])
  const mastodon = useMastodon((s) => !!s.acct)
  const bluesky = useAtproto((s) => !!s.did)
  const blueskyTimeline = useAtproto((s) => canReadTimeline(s.scope))
  const variant = params.get('v') ?? undefined
  // Your default order (Settings, Tuning) unless the address picks one.
  const defaultSort: SortMode = feedOrder === 'latest' ? 'new' : 'hot'
  const sort = (params.get('sort') as SortMode | null) ?? defaultSort
  const sourceFilter = (params.get('src') as SourceKind | null) ?? undefined
  const kindFilter = (['shared', 'discussions'] as const).find((k) => k === params.get('kind'))
  const channel = useMemo(
    () =>
      resolveChannel(channelId, variant, {
        followed,
        interests,
        customFeeds,
        bskyFeeds,
        communities,
        mixes,
        followedMixes,
        people,
        boards,
        releaseRepos,
        mastodon,
        bluesky,
        blueskyTimeline,
        statusHosts,
      }),
    [channelId, variant, followed, interests, customFeeds, bskyFeeds, communities, mixes, followedMixes, people, boards, releaseRepos, mastodon, bluesky, blueskyTimeline, statusHosts],
  )
  const feed = useChannelFeed(channel, sort)
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
              {visible.slice(0, limit).map((s) => (
                <StoryRow key={s.key} story={s} selected={s.key === (itemKey ?? cursor)} read={!!read[s.key] && s.key !== itemKey} onOpen={open} now={now} />
              ))}
            </div>
            {allFailed && (
              <div className="px-6 py-16 text-center">
                <p className="text-[1.125rem] font-bold">Nothing came through</p>
                <p className="mt-2 text-sm text-ink-3">
                  {navigator.onLine ? (feed.statuses.length > 1 ? 'Every source failed:' : 'It failed:') : "You're offline and nothing for this channel is cached yet."}
                </p>
                {navigator.onLine && (
                  <ul className="mx-auto mt-3 max-w-md space-y-1 text-left text-sm text-ink-2">
                    {feed.statuses.map((s) => (
                      <li key={s.id}>
                        <span className="font-semibold text-ink">{s.label}</span>: {s.error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
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
              <p className="px-6 py-16 text-center text-ink-3">{channel.quiet && !sourceFilter && !kindFilter ? channel.quiet : 'No stories match. Try another source or sort.'}</p>
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
