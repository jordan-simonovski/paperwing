import { AtSign, Heart, Loader2, MessageSquareReply, Quote, Repeat2, RefreshCw, UserPlus, ArrowBigUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { SourceIcon } from '../components/SourceIcon'
import { Split, usePane } from '../components/Split'
import { canReadNotifications, useAtproto } from '../lib/atproto'
import { listOf } from '../lib/channels'
import { compact, fullDate, timeAgo } from '../lib/format'
import { useNow } from '../lib/hooks'
import { useActivityFeed, useInboxSeen, type Mine, type Network, type Notice, type NoticeKind } from '../lib/inbox'

// Activity: what's happened to you on every network you're signed in to, and what you've
// written there, in one list each. Opening one shows its thread in the reader.

const NETWORK_NAMES: Record<Network, string> = { bluesky: 'Bluesky', hn: 'Hacker News', frontpage: 'Frontpage', mastodon: 'Mastodon', lemmy: 'Lemmy' }
const KIND_ICON: Record<NoticeKind, React.ReactNode> = {
  reply: <MessageSquareReply size={13} />,
  mention: <AtSign size={13} />,
  quote: <Quote size={13} />,
  like: <Heart size={13} />,
  repost: <Repeat2 size={13} />,
  follow: <UserPlus size={13} />,
  vote: <ArrowBigUp size={13} />,
}

function who(actors: string[]) {
  const names = actors.slice(0, 2)
  return actors.length > 2 ? `${names.join(', ')} and ${actors.length - 2} ${actors.length === 3 ? 'other' : 'others'}` : listOf(names)
}

const VERBS: Record<NoticeKind, string> = {
  reply: 'replied to you',
  mention: 'mentioned you',
  quote: 'quoted your post',
  like: 'liked your post',
  repost: 'reposted your post',
  follow: 'followed you',
  vote: 'voted on your post',
}
const verb = (n: Notice) => (n.kind === 'reply' && n.onPost ? 'commented on your post' : VERBS[n.kind])

function NoticeRow({ n, fresh, onOpen, now, selected }: { n: Notice; fresh: boolean; onOpen: (n: Notice) => void; now: number; selected: boolean }) {
  return (
    <button className={`inbox-row${fresh ? ' fresh' : ''}${selected ? ' selected' : ''}`} onClick={() => onOpen(n)}>
      <span className="inbox-icon" aria-hidden>
        <SourceIcon source={n.network} size={16} />
        <span className={`inbox-kind k-${n.kind}`}>{KIND_ICON[n.kind]}</span>
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[0.9375rem] leading-snug">
          <span className="font-semibold">{who(n.actors)}</span> <span className="text-ink-2">{verb(n)}</span>
          <span className="ml-2 text-ink-3" title={fullDate(n.at)}>
            {timeAgo(n.at, now)}
          </span>
        </span>
        {n.text && <span className="mt-1 line-clamp-3 block text-[0.9375rem] leading-snug text-ink">{n.text}</span>}
        {n.subject && <span className="mt-1 line-clamp-1 block text-[0.8125rem] text-ink-3">on “{n.subject}”</span>}
      </span>
      {fresh && <span className="inbox-dot" aria-label="New" />}
    </button>
  )
}

function MineRow({ m, onOpen, now, selected }: { m: Mine; onOpen: (m: Mine) => void; now: number; selected: boolean }) {
  return (
    <button className={`inbox-row${selected ? ' selected' : ''}`} onClick={() => onOpen(m)}>
      <span className="inbox-icon" aria-hidden>
        <SourceIcon source={m.network} size={16} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        {m.on && <span className="mb-0.5 line-clamp-1 block text-[0.8125rem] text-ink-3">on “{m.on}”</span>}
        <span className={`line-clamp-3 block leading-snug ${m.kind === 'post' ? 'text-[1rem] font-semibold' : 'text-[0.9375rem]'}`}>{m.text}</span>
        <span className="meta mt-1">
          <span>{NETWORK_NAMES[m.network]}</span>
          <span title={fullDate(m.at)}>{timeAgo(m.at, now)}</span>
          {m.score !== undefined && m.score > 0 && (
            <span className="num">
              {compact(m.score)} {m.network === 'hn' || m.network === 'frontpage' || m.network === 'lemmy' ? 'points' : 'likes'}
            </span>
          )}
          {m.replies !== undefined && m.replies > 0 && <span className="num">{compact(m.replies)} replies</span>}
        </span>
      </span>
    </button>
  )
}

type View = 'notices' | 'posts' | 'comments'

export function ActivityPage() {
  const { itemKey } = useParams()
  const [params, setParams] = useSearchParams()
  const view = (['posts', 'comments'] as const).find((v) => v === params.get('view')) ?? 'notices'
  const [network, setNetwork] = useState<Network>()
  const now = useNow()
  const { notices, mine, statuses, connected, refetch } = useActivityFeed()
  const { open } = usePane('/activity')
  const missingNotifications = useAtproto((a) => !!a.did && canReadNotifications(a.scope) === false)

  // What's new is what arrived since you last looked; looking clears the count on the nav.
  const [seenAt] = useState(() => useInboxSeen.getState().seenAt)
  const markSeen = useInboxSeen((s) => s.markSeen)
  useEffect(() => {
    if (view === 'notices') markSeen()
  }, [view, notices.length, markSeen])

  const shownNotices = useMemo(() => notices.filter((n) => !network || n.network === network), [notices, network])
  const shownMine = useMemo(() => mine.filter((m) => (!network || m.network === network) && m.kind === (view === 'posts' ? 'post' : 'comment')), [mine, network, view])
  const loading = statuses.some((s) => s.pending)
  const failed = statuses.filter((s) => s.error)

  const go = (target: { open?: string; url?: string }) => {
    if (target.open) open(target.open, 'discussion')
    else if (target.url) window.open(target.url, '_blank', 'noopener')
  }
  const setView = (v: View) => {
    const next = new URLSearchParams(params)
    if (v === 'notices') next.delete('view')
    else next.set('view', v)
    setParams(next, { replace: true })
  }

  return (
    <Split
      base="/activity"
      itemKey={itemKey}
      idle={
        <div className="grid h-full place-items-center p-10 text-center">
          <div className="max-w-sm">
            <p className="text-[1.375rem] font-bold">Everything that’s happened to you</p>
            <p className="mt-2 text-[0.9375rem] text-ink-3">
              Replies, mentions and likes from every network you’ve signed in to, and everything you’ve written there. Open one to read its thread here.
            </p>
          </div>
        </div>
      }
      list={
        <>
          <header className="px-3 pt-3 md:px-4 md:pt-4">
            <div className="field px-5 pb-4 pt-5">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-[1.75rem] font-bold leading-[1.1] tracking-[-0.02em]">Activity</h1>
                <button className="icon-btn" onClick={refetch} aria-label="Refresh" title="Refresh">
                  <RefreshCw size={16} className={loading ? 'spin' : undefined} />
                </button>
              </div>
              <p className="mt-1.5 text-[0.9375rem] opacity-85">
                {connected.length ? `From ${listOf([...new Set(connected)].map((n) => NETWORK_NAMES[n]))}` : 'Sign in to a network to see your activity'}
              </p>
            </div>
          </header>

          {connected.length > 0 && (
            <div className="sticky-head flex items-center gap-2 overflow-x-auto py-2.5 pl-4 pr-3 [scrollbar-width:none] md:pl-5">
              <div className="seg flex-none" role="group" aria-label="Show">
                {(
                  [
                    ['notices', 'Notifications'],
                    ['posts', 'Posts'],
                    ['comments', 'Comments'],
                  ] as const
                ).map(([v, label]) => (
                  <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
                    {label}
                  </button>
                ))}
              </div>
              {new Set(connected).size > 1 &&
                [...new Set(connected)].map((n) => (
                  <button
                    key={n}
                    className={`chip h-8 flex-none px-3 ${network === n ? 'on' : ''}`}
                    aria-pressed={network === n}
                    onClick={() => setNetwork(network === n ? undefined : n)}
                    title={NETWORK_NAMES[n]}
                  >
                    <SourceIcon source={n} size={14} mono={network === n} />
                    <span className="max-sm:sr-only">{NETWORK_NAMES[n]}</span>
                  </button>
                ))}
            </div>
          )}

          {!connected.length && (
            <div className="px-6 py-16 text-center">
              <p className="text-[1.125rem] font-bold">Nothing to show yet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-3">
                Sign in with Bluesky (which also covers Frontpage), Hacker News, Mastodon or Lemmy, and your replies, mentions, posts and comments gather here.
              </p>
              <Link className="btn mt-5 inline-flex" to="/settings/sources">
                Open Settings
              </Link>
            </div>
          )}

          {view === 'notices' && missingNotifications && (
            <p className="mx-4 mt-2 rounded-xl bg-sunk px-4 py-3 text-[0.875rem] text-ink-2 md:mx-5">
              Your Bluesky sign-in is from before Activity, so Bluesky notifications are missing.{' '}
              <Link className="font-semibold text-ink underline underline-offset-2" to="/settings/sources">
                Allow it in Settings
              </Link>
            </p>
          )}

          {failed.length > 0 && <p className="mx-4 mt-2 text-[0.8125rem] text-signal md:mx-5">{failed.map((f) => `${NETWORK_NAMES[f.network]}: ${f.error?.message}`).join(' · ')}</p>}

          <div className="pb-6">
            {view === 'notices'
              ? shownNotices.map((n) => <NoticeRow key={n.id} n={n} fresh={n.at > seenAt} onOpen={go} now={now} selected={!!n.open && n.open === itemKey} />)
              : shownMine.map((m) => <MineRow key={m.id} m={m} onOpen={go} now={now} selected={!!m.open && m.open === itemKey} />)}
            {connected.length > 0 && !loading && (view === 'notices' ? !shownNotices.length : !shownMine.length) && (
              <p className="px-6 py-16 text-center text-ink-3">{view === 'notices' ? 'No notifications yet.' : view === 'posts' ? 'No posts yet.' : 'No comments yet.'}</p>
            )}
            {loading && !(view === 'notices' ? shownNotices.length : shownMine.length) && <Loader2 size={20} className="spin mx-auto mt-10 text-ink-3" />}
          </div>
        </>
      }
    />
  )
}
