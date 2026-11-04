import { usePretext } from '../lib/pretext'
import { AddToMix } from './AddToMix'
import { RssButton } from './RssButton'
import { BoardHeader } from './BoardHeader'
import { ProfileHeader } from './ProfileHeader'
import { AlertTriangle, Check, Link2, Loader2, PenLine, Plus, RefreshCw, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { findTopic, listOf, mixSourceFor, rssPath, type Channel } from '../lib/channels'
import { topicIcon } from '../lib/topicIcons'
import type { FeedStatus } from '../lib/hooks'
import { kindOf, type Ranked, type SortMode, type StoryKind } from '../lib/rank'
import { usePrefs } from '../lib/store'
import { toast } from '../lib/ui'
import { postLink, useComposer } from '../lib/compose'
import { parseChannelId } from '../lib/channelId'
import { toggleCommunity } from '../lib/explore'
import { Link } from 'react-router'
import { boardPath, useAllBoardsWhen } from '../lib/boards'
import { boardsAbout, byActivity } from '../lib/boardFinder'
import { cooccurringTopics, type Topic } from '../lib/topics'
import type { SourceKind } from '../lib/types'
import { SOURCE_NAMES } from './Source'
import { Sheet } from './Sheet'
import { FeedIcon, SourceIcon } from './SourceIcon'
import { TopicChip } from './TopicTag'
import { ChannelShare } from './ChannelShare'

interface Props {
  channel: Channel
  stories: Ranked[]
  statuses: FeedStatus[]
  sort: SortMode
  onSort: (s: SortMode) => void
  variant?: string
  onVariant: (v: string) => void
  sourceFilter?: SourceKind
  onSourceFilter: (s?: SourceKind) => void
  kindFilter?: StoryKind
  onKindFilter: (k?: StoryKind) => void
  fetching: boolean
  onRefresh: () => void
}

const SORT_HINTS: Record<SortMode, string> = {
  hot: 'Ranked: engagement, freshness and your taste',
  new: 'Newest first, from every source’s latest posts. No ranking.',
  top: 'Most engagement first',
  spicy: 'The most heated discussions first',
}

export function FeedHeader({ channel, stories, statuses, sort, onSort, variant, onVariant, sourceFilter, onSourceFilter, kindFilter, onKindFilter, fetching, onRefresh }: Props) {
  const { followed, toggleFollow } = usePrefs()
  const isTopic = !!channel.topic
  const following = followed.includes(channel.id)

  // Hand-written relations first, then whatever keeps co-occurring in this feed.
  const near = useMemo(() => {
    const ids = [...(channel.related ?? [])]
    if (channel.topic) for (const t of cooccurringTopics(stories, channel.topic.id)) if (!ids.includes(t)) ids.push(t)
    return ids.filter((id) => id !== channel.id).slice(0, 6)
  }, [channel, stories])

  // Community boards about this topic, the liveliest first. Fetched only on a topic's page.
  const { data: allBoards } = useAllBoardsWhen(isTopic)
  const boardsHere = useMemo(() => (channel.topic && allBoards ? byActivity(boardsAbout(allBoards, channel.topic)).slice(0, 6) : []), [allBoards, channel.topic])

  const sources = useMemo(() => {
    const counts = new Map<SourceKind, number>()
    for (const s of stories) counts.set(s.source, (counts.get(s.source) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [stories])

  const kinds = useMemo(() => {
    let discussions = 0
    for (const s of stories) if ((!sourceFilter || s.source === sourceFilter) && kindOf(s) === 'discussions') discussions++
    const total = sourceFilter ? stories.filter((s) => s.source === sourceFilter).length : stories.length
    return { shared: total - discussions, discussions }
  }, [stories, sourceFilter])
  const splitKinds = kindFilter || (kinds.shared > 0 && kinds.discussions > 0)

  // On a phone the filters and related topics live in one sheet rather than rows that scroll off-screen.
  const [sheet, setSheet] = useState(false)
  const [sortHint, setSortHint] = useState<SortMode>()
  const hintTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(hintTimer.current), [])
  const chooseSort = (s: SortMode) => {
    onSort(s)
    setSortHint(s)
    window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setSortHint(undefined), 4000)
  }
  const closeSheet = useCallback(() => setSheet(false), [])
  const filterLabel = [sourceFilter && SOURCE_NAMES[sourceFilter], kindFilter && (kindFilter === 'shared' ? 'Shared' : 'Discussions')].filter(Boolean).join(', ')

  const failed = statuses.filter((s) => s.status === 'error')
  const loading = statuses.filter((s) => s.status === 'pending').length
  // Where links can be posted: PaperWing and its topic boards.
  const address = parseChannelId(channel.id)
  const shareControl = <ChannelShare channel={channel} sort={sort} variant={variant} sourceFilter={sourceFilter} kindFilter={kindFilter} />
  const postsHere = address?.kind === 'paperwing'
  // A Lemmy community's own channel can be joined from here.
  const community = address?.kind === 'community' ? address.name : undefined
  const mixable = mixSourceFor(channel, usePrefs.getState().interests)
  const joinedIt = usePrefs((p) => !!community && p.communities.some((c) => c.name === community))
  // For you wears the colours of what it ranks: a blend of your topics' fields, with their icons.
  const interests = usePrefs((p) => p.interests)
  const forYou = channel.id === 'for-you'
  const blend = forYou ? (channel.boost ?? []).map((id) => findTopic(id, interests)).filter((t): t is Topic => !!t) : []
  const hues = blend.length ? blend.slice(0, 4).map((t) => t.hue) : [28, 300, 210]
  const glyphs = forYou ? (blend.length ? blend.slice(0, 3).map((t) => topicIcon(t.id)) : [Sparkles]) : channel.topic ? [topicIcon(channel.topic.id)] : []
  // Switching channels, the field's colour glides to the next topic's hue (with Motion on).
  const glide = usePretext()
  const fieldClass = channel.topic ? 'topic' : forYou ? 'topic blend' : ''
  const fieldStyle = (
    forYou
      ? {
          '--h': hues[0],
          '--blend': `linear-gradient(115deg, ${hues.map((h, i) => `oklch(var(--field-l) var(--field-c) ${h}) ${Math.round((i / Math.max(1, hues.length - 1)) * 100)}%`).join(', ')})`,
        }
      : channel.hue !== undefined
        ? { '--h': channel.hue }
        : undefined
  ) as React.CSSProperties | undefined

  return (
    <>
      {channel.board ? (
        <BoardHeader did={channel.board.did} rkey={channel.board.rkey} uri={channel.board.uri} />
      ) : channel.person ? (
        <ProfileHeader actor={channel.person} />
      ) : (
        <header className="px-3 pt-3 md:px-4 md:pt-4">
          <div className={`field relative isolate overflow-hidden px-4 pb-3.5 pt-4 md:px-5 ${fieldClass}${glide ? ' field-glide' : ''}`} style={fieldStyle}>
            {glyphs.map((G, i) => (
              <G key={i} className={`field-glyph g${i}`} aria-hidden strokeWidth={1.5} />
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1 basis-full sm:basis-0">
                <h1 className="feed-title text-[1.5rem] font-bold leading-[1.15] tracking-[-0.02em] [overflow-wrap:break-word]">{channel.label}</h1>
                {forYou && blend.length > 0 ? (
                  // What it's ranking, on phones too: the topics' marks and names.
                  <p className="mt-1.5 flex min-w-0 items-center gap-2 text-[0.875rem]">
                    <span className="field-marks" aria-hidden>
                      {blend.slice(0, 5).map((t) => {
                        const I = topicIcon(t.id)
                        return (
                          <span key={t.id} className="field-mark topic" style={{ '--h': t.hue } as React.CSSProperties}>
                            <I size={13} strokeWidth={2.25} />
                          </span>
                        )
                      })}
                    </span>
                    <span className="min-w-0 truncate opacity-85" title={channel.blurb}>
                      {listOf(blend.slice(0, 3).map((t) => t.label))}
                      {blend.length > 3 ? ` and ${blend.length - 3} more` : ''}
                    </span>
                  </p>
                ) : (
                  channel.blurb && (
                    <p className={`truncate text-[0.875rem] opacity-80 ${forYou ? '' : 'max-sm:hidden'}`} title={channel.blurb}>
                      {channel.blurb}
                    </p>
                  )
                )}
              </div>
              {isTopic && (
                <button
                  className={`btn h-8 flex-none px-3.5 text-[0.8125rem] ${following ? 'following' : ''}`}
                  onClick={() => {
                    if (!following && address?.kind === 'interest' && !interests.some((i) => i.id === channel.id)) {
                      usePrefs.getState().addInterest(channel.topic!.label)
                      return
                    }
                    toggleFollow(channel.id)
                    // Unfollowing takes a topic out of For you and the sidebar: easy to take back.
                    if (following) toast(`Unfollowed ${channel.label}`, { action: { label: 'Undo', run: () => toggleFollow(channel.id) } })
                  }}
                  aria-pressed={following}
                >
                  {following ? <Check size={14} /> : <Plus size={14} />}
                  {following ? 'Following' : 'Follow'}
                </button>
              )}
              {community && (
                <button
                  className={`btn h-8 flex-none px-3.5 text-[0.8125rem] ${joinedIt ? 'following' : ''}`}
                  onClick={() => toggleCommunity({ name: community, title: channel.label })}
                  aria-pressed={joinedIt}
                >
                  {joinedIt ? <Check size={14} /> : <Plus size={14} />}
                  {joinedIt ? 'Joined' : 'Join'}
                </button>
              )}
              {mixable && <AddToMix source={mixable.source} label={mixable.label} className="btn h-8 flex-none px-3 text-[0.8125rem] max-sm:px-2.5" textClassName="max-sm:hidden" />}
              {shareControl}
              {postsHere && (
                <>
                  <button className="btn h-8 flex-none px-3.5 text-[0.8125rem]" onClick={() => postLink({ board: address?.kind === 'paperwing' ? address.board : undefined })}>
                    <Link2 size={14} /> Post a link
                  </button>
                  <button
                    className="btn h-8 flex-none px-3.5 text-[0.8125rem]"
                    onClick={() => useComposer.getState().open({ kind: 'self-post', board: address?.kind === 'paperwing' ? address.board : undefined })}
                  >
                    <PenLine size={14} /> Write a post
                  </button>
                </>
              )}
              {rssPath(channel.id) && <RssButton path={rssPath(channel.id)!} />}
              {channel.action && (
                <Link className="btn h-8 flex-none px-3.5 text-[0.8125rem]" to={channel.action.to}>
                  {channel.action.label}
                </Link>
              )}
            </div>
            {boardsHere.length > 0 && (
              <div className="scroll-x -mx-4 mt-2 flex items-center gap-1.5 px-4 md:-mx-5 md:px-5" aria-label={`Boards about ${channel.label}`}>
                <span className="mr-0.5 flex-none text-[0.8125rem] font-semibold opacity-80">Boards</span>
                {boardsHere.map((b) => (
                  <Link key={b.uri} className="chip h-7 flex-none px-2.5 text-[0.8125rem]" to={boardPath(b.uri)}>
                    {b.name}
                  </Link>
                ))}
              </div>
            )}
            {/* One line that scrolls sideways, so related topics never push the stories down. */}
            {near.length > 0 && (
              <div className="scroll-x -mx-4 mt-3 flex items-center gap-1.5 px-4 max-sm:hidden md:-mx-5 md:px-5" aria-label="Related topics">
                <span className="mr-0.5 flex-none text-[0.8125rem] font-semibold opacity-80">Related</span>
                {near.map((id) => (
                  <TopicChip key={id} id={id} small />
                ))}
              </div>
            )}
          </div>
        </header>
      )}
      {(channel.board || channel.person) && <div className="px-4 pt-2 md:px-5">{shareControl}</div>}

      {/* Sort and source filters share one sticky row. Outside <header> so it sticks for the whole list. */}
      <div className="sticky-head flex items-center gap-2 py-2.5 pl-4 pr-2 md:pl-5 md:pr-3">
        <div className="seg flex-none" role="group" aria-label={channel.variants ? 'List' : 'Sort'}>
          {channel.variants
            ? channel.variants.map((v) => (
                <button key={v.id} aria-pressed={variant === v.id} onClick={() => onVariant(v.id)}>
                  {v.label}
                </button>
              ))
            : (['hot', 'new', 'top', 'spicy'] as const).map((s) => (
                <button key={s} aria-pressed={sort === s} onClick={() => chooseSort(s)} title={SORT_HINTS[s]}>
                  {s === 'hot' ? 'Hot' : s === 'new' ? 'Latest' : s === 'top' ? 'Top' : 'Spicy'}
                </button>
              ))}
        </div>
        {sources.length > 1 || splitKinds ? (
          <div className="scroll-x flex min-w-0 flex-1 items-center gap-1.5 max-sm:hidden" role="group" aria-label="Filter stories">
            {splitKinds &&
              (['shared', 'discussions'] as const).map((k) => (
                <button
                  key={k}
                  className={`chip h-8 flex-none px-3 ${kindFilter === k ? 'on' : ''}`}
                  aria-pressed={kindFilter === k}
                  onClick={() => onKindFilter(kindFilter === k ? undefined : k)}
                  title={
                    kindFilter === k
                      ? 'Show everything'
                      : k === 'shared'
                        ? 'Only things shared: articles, papers, repos, images and video'
                        : 'Only posts that are the conversation itself: Ask HN, Bluesky text posts'
                  }
                >
                  {k === 'shared' ? 'Shared' : 'Discussions'} <span className="num font-normal opacity-75">{kinds[k]}</span>
                </button>
              ))}
            {splitKinds && sources.length > 1 && <span className="mx-1 h-5 w-px flex-none bg-line" aria-hidden />}
            {sources.length > 1 &&
              sources.map(([src, n]) => (
                <button
                  key={src}
                  className={`chip h-8 flex-none px-3 ${sourceFilter === src ? 'on' : ''}`}
                  aria-pressed={sourceFilter === src}
                  onClick={() => onSourceFilter(sourceFilter === src ? undefined : src)}
                  title={sourceFilter === src ? 'Show every source' : `Only ${SOURCE_NAMES[src]}`}
                >
                  <SourceIcon source={src} size={14} mono={sourceFilter === src} />
                  {SOURCE_NAMES[src]} <span className="num font-normal opacity-75">{n}</span>
                </button>
              ))}
          </div>
        ) : (
          <div className="flex-1 max-sm:hidden" />
        )}
        <div className="flex min-w-0 flex-1 sm:hidden">
          {(sources.length > 1 || splitKinds || near.length > 0) && (
            // It shares the row with four sorts and the failure count, so with no filter on it can shrink to its icon.
            <button className={`chip h-8 min-w-0 px-3 ${filterLabel ? 'on' : ''}`} onClick={() => setSheet(true)} aria-haspopup="dialog" aria-label={filterLabel ? `Filter: ${filterLabel}` : 'Filter'}>
              <SlidersHorizontal size={14} className="flex-none" />
              <span className={`min-w-0 truncate ${filterLabel ? '' : 'max-[420px]:hidden'}`}>{filterLabel || 'Filter'}</span>
            </button>
          )}
        </div>
        <div className="flex flex-none items-center">
          {loading > 0 && <Loader2 size={16} className="spin mx-2 text-ink-3" aria-label={`Loading ${loading} sources`} />}
          {failed.length > 0 && (
            // A tap shows the reasons too: phones have no hover.
            <button
              className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-[0.8125rem] font-bold text-signal"
              title={failed.map((f) => `${f.label}: ${f.error}`).join('\n')}
              aria-label={`${failed.length} ${failed.length === 1 ? 'source' : 'sources'} failed`}
              onClick={() => toast(failed.map((f) => `${f.label}: ${f.error}`).join(' · '), { tone: 'error' })}
            >
              <AlertTriangle size={15} /> <span className="num">{failed.length}</span>
            </button>
          )}
          <button className="icon-btn" onClick={onRefresh} title="Refresh (r)" aria-label="Refresh">
            <RefreshCw size={16} className={fetching ? 'spin' : undefined} />
          </button>
        </div>
      </div>
      {/* What a sort means, said once when it changes: touch screens never see a tooltip. */}
      {sortHint && (
        <p className="sort-hint px-4 pb-2 text-[0.8125rem] text-ink-3 md:px-5" role="status">
          {SORT_HINTS[sortHint]}
        </p>
      )}

      <Sheet open={sheet} onClose={closeSheet} side="bottom" label="Filter stories">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" aria-hidden />
        {splitKinds && (
          <section>
            <h2 className="mb-2 text-[0.875rem] font-semibold text-ink-3">Show</h2>
            <div className="seg w-full" role="group" aria-label="Show">
              {([undefined, 'shared', 'discussions'] as const).map((k) => (
                <button key={k ?? 'all'} className="flex-1" aria-pressed={kindFilter === k} onClick={() => onKindFilter(k)}>
                  {k === 'shared' ? 'Shared' : k === 'discussions' ? 'Discussions' : 'Everything'}
                  {k && <span className="num ml-1 font-normal opacity-75">{kinds[k]}</span>}
                </button>
              ))}
            </div>
          </section>
        )}
        {sources.length > 1 && (
          <section className="mt-5">
            <h2 className="mb-1 text-[0.875rem] font-semibold text-ink-3">Source</h2>
            {[undefined, ...sources.map(([src]) => src)].map((src) => (
              <button
                key={src ?? 'all'}
                className="flex h-11 w-full items-center gap-3 rounded-[var(--r-control)] px-2 text-left text-[1rem] active:bg-sunk"
                aria-pressed={sourceFilter === src}
                onClick={() => onSourceFilter(src)}
              >
                <span className="grid w-5 place-items-center">{src ? <SourceIcon source={src} size={16} /> : null}</span>
                <span className="flex-1">{src ? SOURCE_NAMES[src] : 'Every source'}</span>
                <span className="num text-ink-3">{src ? sources.find(([s]) => s === src)![1] : stories.length}</span>
                <Check size={16} className={sourceFilter === src ? 'text-ink' : 'invisible'} />
              </button>
            ))}
          </section>
        )}
        {near.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-2 text-[0.875rem] font-semibold text-ink-3">Related topics</h2>
            <div className="flex flex-wrap gap-1.5">
              {near.map((id) => (
                <TopicChip key={id} id={id} />
              ))}
            </div>
          </section>
        )}
        <button className="btn btn-primary mt-6 h-11 w-full justify-center" onClick={closeSheet}>
          Done
        </button>
      </Sheet>
    </>
  )
}

export function SourceStatusList({ statuses }: { statuses: FeedStatus[] }) {
  return (
    <table className="w-full text-[0.875rem]">
      <tbody>
        {statuses.map((s) => (
          <tr key={s.id} title={s.error}>
            <td className="py-1.5 pr-4 text-ink-2">
              <span className="inline-flex items-center gap-2">
                <FeedIcon feed={s.ref} size={14} />
                {s.label}
              </span>
            </td>
            <td className={`num py-1.5 text-right ${s.status === 'error' ? 'font-semibold text-signal' : 'text-ink-3'}`}>{s.status === 'success' ? s.count : s.status === 'error' ? 'Failed' : '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
