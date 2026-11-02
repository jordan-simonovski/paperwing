import { useComposer } from '../lib/compose'
import { FriendsLine } from './FriendsLine'
import { profilePath } from '../lib/people'
import { boardPath } from '../lib/boards'
import { OfficialBadge } from './OfficialBadge'
import { Link } from 'react-router'
import { ArrowBigDown, ArrowBigUp, Bookmark, BookmarkCheck, EyeOff, Image as ImageIcon, Loader2, MessageSquare, Play, Newspaper, Share2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { memo, useMemo, useRef } from 'react'
import { compact, domainOf, fullDate, fullNumber, timeAgo } from '../lib/format'
import { useSwipeActions } from '../lib/gestures'
import { plainText } from '../lib/html'
import { stateOf, useLibrary } from '../lib/library'
import { isWatching, useWatch } from '../lib/watch'
import { domainKey, type Ranked } from '../lib/rank'
import { useImpression } from '../lib/impressions'
import { topicsForStory } from '../lib/topics'
import { LESSON, useActivity, usePrefs } from '../lib/store'
import { castVote, storyVote, useAccounts, useVoted } from '../lib/accounts'
import { rowOutlets } from '../lib/coverage'
import type { Story } from '../lib/types'
import { toast } from '../lib/ui'
import { scoreUnit, SOURCE_NAMES, sourceLabel } from './Source'
import { mediaLabel } from './Media'
import { Thumb, thumbFor } from './Thumb'
import { StoryIcon } from './SourceIcon'
import { TopicTag } from './TopicTag'
import { SpiceMark } from './Spice'

/** Sources without votes read better with a line of their abstract or description. */
const EXCERPT_SOURCES = new Set(['rss', 'arxiv', 'hf', 'github', 'release', 'bluesky', 'lemmy', 'mastodon', 'status', 'frontpage'])

interface Props {
  story: Ranked
  selected: boolean
  read: boolean
  onOpen: (key: string, tab?: 'discussion' | 'article' | 'related') => void
  now: number
  /** A line under the meta, for page-specific state (reading progress, new comments). */
  note?: React.ReactNode
  /** Replaces the default swipes (right saves, left hides). */
  swipe?: { right?: [label: string, run: () => void]; left?: [label: string, run: () => void] }
}

export const StoryRow = memo(function StoryRow({ story: s, selected, read, onOpen, now, note, swipe }: Props) {
  const showExcerpts = usePrefs((p) => p.showExcerpts)
  const thumbnails = usePrefs((p) => p.thumbnails)
  // Behind a warning: the note shows, and in blur mode the picture (and, unless only pictures were flagged, the excerpt) is covered.
  const warnMode = usePrefs((p) => p.warnings)
  const cover = !!s.warning && warnMode === 'blur'
  const saved = useLibrary((l) => !!l.items[s.key])
  const pending = useLibrary((l) => !!l.pending[s.key])
  const domain = domainOf(s.url)
  const plain = showExcerpts && s.text && EXCERPT_SOURCES.has(s.source) ? plainText(s.text) : undefined
  // A text-only post's title is its own first line; repeating it as an excerpt adds nothing.
  const excerpt = plain && !plain.startsWith(s.title.replace(/…$/, '').slice(0, 40)) ? plain : undefined
  const rowRef = useRef<HTMLElement>(null)
  useImpression(rowRef, s.key, !read)
  const vote = useActivity((a) => a.votes[s.key])
  const swipeRef = useSwipeActions<HTMLDivElement>({ right: swipe?.right?.[1] ?? (() => void toggleSaved(s)), left: swipe?.left?.[1] ?? (() => hideStory(s.key, s)) })
  const comments = s.comments ?? 0
  const thumb = thumbnails ? thumbFor(s) : undefined
  const also = [...new Set(s.alsoOn.map(sourceLabel))]
  // Other outlets' takes on the same event: what the feed grouped, plus a news search already run for it.
  const qc = useQueryClient()
  // Re-read when the row is selected: opening a story is what runs its news search.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { stories: coverage, outlets } = useMemo(() => rowOutlets(qc, s, s.coverage), [qc, s, selected])
  const covered = outlets > 1 ? coverage : []

  return (
    <div className="swipe" ref={swipeRef} data-right-label={swipe?.right?.[0] ?? (saved ? 'Unsave' : 'Save')} data-left-label={swipe?.left?.[0] ?? 'Hide'}>
      <article
        ref={rowRef}
        id={`row-${s.key}`}
        className={`row${selected ? ' selected' : ''}${read ? ' read' : ''}${vote === -1 ? ' downvoted' : ''}`}
        onClick={() => onOpen(s.key)}
        aria-current={selected || undefined}
      >
        <div className="row-head">
          <StoryIcon story={s} size={16} />
          <span className="row-source">{sourceLabel(s)}</span>
          {/* A PaperWing listing is someone's pick: who, with a way to their profile. */}
          {s.sourceLabel === 'PaperWing' && s.author && (
            <>
              <span aria-hidden>·</span>
              <Link className="row-domain" to={profilePath(s.author)} onClick={(e) => e.stopPropagation()} title={`@${s.author}’s profile`}>
                @{s.author}
              </Link>
            </>
          )}
          {/* A board's listing on the front page: which board, like a subreddit's name. */}
          {s.board && (
            <>
              <span aria-hidden>·</span>
              <Link className="row-domain inline-flex items-center gap-1" to={boardPath(s.board.uri)} onClick={(e) => e.stopPropagation()} aria-label={`in ${s.board.name}`}>
                in {s.board.name}
              </Link>
              {s.board.official && <OfficialBadge size={13} />}
            </>
          )}
          {s.pinned && <span className="pinned-chip">Pinned</span>}
          <span aria-hidden>·</span>
          {/* The full date is only for hovering, and formatting it for every row costs on phones: set it on the way in. */}
          <time dateTime={new Date(s.createdAt).toISOString()} onPointerEnter={(e) => (e.currentTarget.title ||= fullDate(s.createdAt))}>
            {timeAgo(s.createdAt, now)}
          </time>
          {domain && (
            <>
              <span aria-hidden>·</span>
              <a className="row-domain" href={s.url!} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="Open the original">
                {domain}
              </a>
            </>
          )}
          {s.media && (
            <span className="inline-flex flex-none items-center gap-1">
              {s.media.some((m) => m.kind === 'video') ? <Play size={12} aria-hidden /> : <ImageIcon size={13} aria-hidden />}
              {mediaLabel(s.media)}
            </span>
          )}
        </div>
        <div className="row-body">
          <div className="min-w-0 flex-1">
            {s.warning && (
              <p className="row-cw">
                <EyeOff size={13} /> {s.warning}
              </p>
            )}
            <h3 className="row-title">
              <a
                href={s.url ?? s.discussionUrl ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  // Plain click reads in-app; modified clicks open the original as usual.
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
                    e.stopPropagation()
                    return
                  }
                  e.preventDefault()
                  e.stopPropagation()
                  onOpen(s.key, s.url ? 'article' : 'discussion')
                }}
              >
                {s.title}
              </a>
            </h3>
            {excerpt && !(cover && !s.warnMediaOnly) && <p className="mt-1 line-clamp-2 text-[0.875rem] leading-snug text-ink-2">{excerpt}</p>}
            {s.quote && !s.quote.gone && showExcerpts && (
              <p className="row-quote mt-1 line-clamp-2 text-[0.8125rem] leading-snug text-ink-3">
                Quoting <span className="font-semibold text-ink-2">@{s.quote.author}</span>: {plainText(s.quote.html)}
              </p>
            )}
            <FriendsLine story={s} className="mt-1.5" />
            {s.shareNote && (
              <p className="row-quote mt-1.5 line-clamp-3 text-[0.875rem] leading-snug text-ink-2">
                <span className="font-semibold">{s.sharedBy?.[0] ? `@${s.sharedBy[0]}` : 'Shared'}:</span> {s.shareNote}
              </p>
            )}
            {s.sharedBy && s.sharedBy.length > 0 && (
              <p className="mt-1 text-[0.8125rem] text-ink-3">
                Shared by{' '}
                <span className="font-semibold text-ink-2">
                  {s.sharedBy
                    .slice(0, 2)
                    .map((h) => `@${h}`)
                    .join(', ')}
                </span>
                {s.sharedBy.length > 2 ? ` and ${s.sharedBy.length - 2} more you follow` : ''}
              </p>
            )}
            {note}
            {(s.topics.length > 0 || also.length > 0 || covered.length > 0) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {s.topics.slice(0, 2).map((t) => (
                  <TopicTag key={t} id={t} />
                ))}
                {also.length > 0 && (
                  <span className="ml-1 text-[0.8125rem] text-ink-3" title={s.alsoOn.map((a) => `${sourceLabel(a)}: ${a.comments ?? 0} comments`).join('\n')}>
                    Also on {also.slice(0, 3).join(', ')}
                  </span>
                )}
                {covered.length > 0 && (
                  <button
                    className="outlets-chip"
                    title={[...new Set(covered.map((c) => `${domainOf(c.url) ?? sourceLabel(c)}: ${c.title}`))].join('\n')}
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpen(s.key, 'related')
                    }}
                  >
                    <Newspaper size={13} /> {outlets} outlets
                  </button>
                )}
              </div>
            )}
          </div>
          {thumb && <Thumb key={thumb} src={thumb} video={s.media?.[0]?.kind === 'video'} blur={cover} />}
        </div>
        <div className="row-bar" onClick={(e) => e.stopPropagation()}>
          <Votes story={s} vote={vote} />
          {s.hasThread && (
            <button className={`pill${comments > 0 && s.heat >= 0.85 ? ' hot' : ''}`} onClick={() => onOpen(s.key, 'discussion')} aria-label={`${comments} comments`} title="Open the discussion (c)">
              <MessageSquare size={15} aria-hidden />
              <span className="num">{compact(comments)}</span>
            </button>
          )}
          <SpiceMark places={[s, ...s.alsoOn]} />
          <span className="flex-1" />
          <button className="pill pill-icon max-sm:hidden" title="Hide (x)" aria-label="Hide" onClick={() => hideStory(s.key, s)}>
            <EyeOff size={15} />
          </button>
          <button
            className={`pill pill-icon${saved ? ' on' : ''}`}
            title={saved ? 'Remove from saved (s)' : 'Save to your queue (s)'}
            aria-label={saved ? 'Remove from saved' : 'Save'}
            aria-pressed={saved}
            onClick={() => void toggleSaved(s)}
          >
            {pending ? <Loader2 size={15} className="spin" /> : saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
          </button>
          <button className="pill pill-icon" title="Share" aria-label="Share" onClick={() => useComposer.getState().open({ kind: 'links', story: s })}>
            <Share2 size={15} />
          </button>
        </div>
      </article>
    </div>
  )
})

/**
 * Up and down, Reddit-style, around the source's own score. Votes stay on this device: they don't
 * reach Hacker News or anywhere else, they teach the ranking what you want more and less of.
 */
export function Votes({ story: s, vote }: { story: Ranked | Story; vote?: 1 | -1 }) {
  const cast = useActivity((a) => a.vote)
  const unit = s.score !== undefined ? scoreUnit(s.source, s.score) : undefined
  // Signed in where the story lives, the up arrow is a real vote there too (accounts.ts).
  const target = storyVote(useAccounts(), s)
  const voted = useVoted(target)
  const platform = target && { on: voted, label: target.label, toggle: () => castVote(target, !voted) }
  const press = (dir: 1 | -1) => {
    const up = dir === 1 && vote !== 1
    cast(s, dir)
    if (platform && up !== platform.on) platform.toggle().catch((err: Error) => toast(err.message, { tone: 'error' }))
  }
  const upOn = vote === 1 || !!platform?.on
  return (
    <span className={`pill votes${upOn ? ' up' : vote === -1 ? ' down' : ''}`} title={s.score !== undefined ? `${fullNumber(s.score)} ${unit} on ${SOURCE_NAMES[s.source]}` : undefined}>
      <button onClick={() => press(1)} aria-label={platform?.label ?? 'More like this'} aria-pressed={upOn} title={platform ? `${platform.label}, and more like this (u)` : 'More like this (u)'}>
        <ArrowBigUp size={18} fill={upOn ? 'currentColor' : 'none'} />
      </button>
      <span className="num">{s.score ? compact(s.score) : 'Vote'}</span>
      <button onClick={() => press(-1)} aria-label="Less like this" aria-pressed={vote === -1} title="Less like this (d)">
        <ArrowBigDown size={18} fill={vote === -1 ? 'currentColor' : 'none'} />
      </button>
    </span>
  )
}

/** What a story says about your taste: its topics and its site. */
export const tasteKeys = (s: Story) => [...(('topics' in s ? (s as Ranked).topics : null) ?? topicsForStory(s)).slice(0, 2).map((t) => `t:${t}`), domainKey(s.url)].filter((k): k is string => !!k)

export function hideStory(key: string, story?: Story) {
  const { toggleHidden } = useActivity.getState()
  toggleHidden(key)
  // A hide is a mild "less like this"; a downvote is the strong one.
  const { learn } = usePrefs.getState()
  if (story) learn(story, -LESSON.hide)
  toast('Story hidden', {
    action: {
      label: 'Undo',
      run: () => {
        toggleHidden(key)
        if (story) learn(story, LESSON.hide)
      },
    },
  })
}

export function toggleWatch(s: Story) {
  const w = useWatch.getState()
  if (isWatching(w.items[s.key])) {
    w.unwatch(s.key)
    toast('Stopped watching', { action: { label: 'Undo', run: () => w.watch(s) } })
  } else {
    w.watch(s)
    toast('Watching. New replies will show up in Saved')
  }
}

/** Moves a saved story between the queue and the archive. Saving an unsaved story first if needed. */
export async function toggleArchived(s: Story) {
  const lib = useLibrary.getState()
  const m = lib.items[s.key]
  if (!m) return
  const archiving = stateOf(m) === 'queue'
  await lib.archive(s.key, archiving)
  toast(archiving ? 'Archived' : 'Back in your queue', { action: { label: 'Undo', run: () => void lib.archive(s.key, !archiving) } })
}

export async function toggleSaved(s: Story) {
  const lib = useLibrary.getState()
  if (lib.pending[s.key]) return
  if (lib.items[s.key]) {
    await lib.remove(s.key)
    toast('Removed from saved', { action: { label: 'Undo', run: () => void lib.save(s) } })
    return
  }
  try {
    const m = await lib.save(s)
    // Saving says you want to read it: half an upvote.
    usePrefs.getState().learn(s, LESSON.save)
    toast(m.hasArticle || m.hasThread ? `Saved to your queue${m.minutes ? `, ${m.minutes} min read` : ''}` : 'Saved, but the article could not be fetched')
  } catch {
    toast('Could not save this story', { tone: 'error' })
  }
}

export function RowSkeleton() {
  return (
    <div className="row" aria-hidden>
      <div className="skel h-3 w-[42%]" />
      <div className="mt-2.5 space-y-2.5">
        <div className="skel h-4 w-[88%]" />
        <div className="skel h-4 w-[56%]" />
      </div>
      <div className="mt-3 flex gap-2">
        <div className="skel h-8 w-24 rounded-full" />
        <div className="skel h-8 w-16 rounded-full" />
      </div>
    </div>
  )
}
