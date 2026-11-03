import { keys } from '../lib/query'
import { CouldntReach } from '../components/FeedState'
import { useQuery } from '@tanstack/react-query'
import { Check, Heart, Loader2, Plus, Search, Users } from 'lucide-react'
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { mixChannel, unfollowMix } from '../lib/mixes'
import { BoardDirectory } from '../components/BoardDirectory'
import { toast } from '../lib/ui'
import { FeedFinder, FeedRow } from '../components/FollowBlogs'
import { bskyFeedChannel } from '../lib/channels'
import { findBlueskyFeeds, findCommunities, toggleBlueskyFeed, toggleCommunity } from '../lib/explore'
import { usePrefs } from '../lib/store'
import { CLUSTERS, TOPICS, type ClusterId } from '../lib/topics'
import { TopicsBody } from './TopicsPage'

// Everything there is to follow: topic packs, Lemmy communities, Bluesky feeds and publishers.

const TABS = [
  { id: 'topics', label: 'Topics' },
  { id: 'mixes', label: 'Mixes' },
  { id: 'boards', label: 'Boards' },
  { id: 'communities', label: 'Communities' },
  { id: 'feeds', label: 'Bluesky feeds' },
  { id: 'publishers', label: 'Publishers' },
] as const
type Tab = (typeof TABS)[number]['id']

const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n)

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative mt-6 block max-w-md">
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
      <input className="input pl-10" type="search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    </label>
  )
}

function Avatar({ src, fallback }: { src?: string; fallback: string }) {
  return src ? (
    <img src={src} alt="" loading="lazy" className="size-10 flex-none rounded-full bg-sunk object-cover" />
  ) : (
    <span className="grid size-10 flex-none place-items-center rounded-full bg-sunk text-[0.9375rem] font-bold text-ink-2">{fallback.slice(0, 1).toUpperCase()}</span>
  )
}

function Communities() {
  const [q, setQ] = useState('')
  const query = useDeferredValue(q.trim())
  const mine = usePrefs((s) => s.communities)
  const found = useQuery({ queryKey: keys.explore('communities', query), queryFn: () => findCommunities(query), staleTime: 10 * 60_000 })
  return (
    <>
      <p className="mt-2 max-w-xl text-[0.9375rem] text-ink-2">
        Lemmy communities are the open web’s subreddits: run by their members, on servers anyone can host. Joined ones get their own channel and show up in Lemmy. Communities on PieFed and Mbin are
        here too.
      </p>
      <SearchBox value={q} onChange={setQ} placeholder="Search communities: “climate”, “cycling”, “aus”" />
      {mine.length > 0 && !query && (
        <section className="mt-8">
          <h2 className="text-[1.125rem] font-bold">Joined</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {mine.map((c) => (
              <Link key={c.name} to={`/t/c:${c.name}`} className="chip h-9 gap-2 px-3 text-[0.9375rem]">
                {c.icon && <img src={c.icon} alt="" className="size-5 rounded-full" />}
                {c.title}
              </Link>
            ))}
          </div>
        </section>
      )}
      <h2 className="mt-8 text-[1.125rem] font-bold">{query ? `Matching “${query}”` : 'Busy right now'}</h2>
      {found.isPending && <Loader2 size={18} className="spin mt-4 text-ink-3" />}
      {found.isError && <CouldntReach what="Lemmy" onRetry={() => void found.refetch()} />}
      {found.data && !found.data.length && <p className="mt-3 text-[0.875rem] text-ink-3">No communities match that.</p>}
      <div className="mt-3 grid grid-cols-1 gap-x-8 lg:grid-cols-2">
        {found.data?.map((c) => {
          const on = mine.some((m) => m.name === c.name)
          return (
            <div key={c.name} className="flex items-start gap-3 border-b border-line py-3">
              <Avatar src={c.icon} fallback={c.title || c.name} />
              <Link to={`/t/c:${c.name}`} className="min-w-0 flex-1">
                <p className="truncate text-[0.9375rem] font-semibold">{c.title}</p>
                <p className="meta">
                  <span>c/{c.name}</span>
                  <span>{compact(c.subscribers)} members</span>
                  <span>{compact(c.active)} active this month</span>
                </p>
                {c.description && <p className="mt-1 line-clamp-2 text-[0.8125rem] text-ink-2">{c.description}</p>}
              </Link>
              <button className={`btn h-8 flex-none px-3 ${on ? 'following' : 'btn-primary'}`} aria-pressed={on} onClick={() => toggleCommunity(c)}>
                {on ? <Check size={14} /> : <Plus size={14} />} {on ? 'Joined' : 'Join'}
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

function BlueskyFeedsTab() {
  const [q, setQ] = useState('')
  const query = useDeferredValue(q.trim())
  const mine = usePrefs((s) => s.bskyFeeds)
  const found = useQuery({ queryKey: keys.explore('bsky-feeds', query), queryFn: () => findBlueskyFeeds(query), staleTime: 10 * 60_000 })
  return (
    <>
      <p className="mt-2 max-w-xl text-[0.9375rem] text-ink-2">
        Feeds built by Bluesky’s communities, for every subject. Added ones become channels, and need no Bluesky account. You can also paste a feed or list link under Settings, Sources.
      </p>
      <SearchBox value={q} onChange={setQ} placeholder="Search feeds: “astronomy”, “books”, “auspol”" />
      <h2 className="mt-8 text-[1.125rem] font-bold">{query ? `Matching “${query}”` : 'Most liked'}</h2>
      {found.isPending && <Loader2 size={18} className="spin mt-4 text-ink-3" />}
      {found.isError && <CouldntReach what="Bluesky" onRetry={() => void found.refetch()} />}
      {found.data && !found.data.length && <p className="mt-3 text-[0.875rem] text-ink-3">No feeds match that.</p>}
      <div className="mt-3 grid grid-cols-1 gap-x-8 lg:grid-cols-2">
        {found.data?.map((f) => {
          const on = mine.some((m) => m.uri === f.uri)
          return (
            <div key={f.uri} className="flex items-start gap-3 border-b border-line py-3">
              <Avatar src={f.avatar} fallback={f.name} />
              <div className="min-w-0 flex-1">
                {on ? (
                  <Link to={`/t/${bskyFeedChannel(f.uri)}`} className="block truncate text-[0.9375rem] font-semibold hover:underline">
                    {f.name}
                  </Link>
                ) : (
                  <p className="truncate text-[0.9375rem] font-semibold">{f.name}</p>
                )}
                <p className="meta">
                  <span>by @{f.by}</span>
                  <span className="inline-flex items-center gap-1">
                    <Heart size={11} aria-label="likes" /> {compact(f.likes)}
                  </span>
                </p>
                {f.description && <p className="mt-1 line-clamp-2 text-[0.8125rem] text-ink-2">{f.description}</p>}
              </div>
              <button className={`btn h-8 flex-none px-3 ${on ? 'following' : 'btn-primary'}`} aria-pressed={on} onClick={() => toggleBlueskyFeed(f)}>
                {on ? <Check size={14} /> : <Plus size={14} />} {on ? 'Added' : 'Add'}
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

function Publishers() {
  const followed = usePrefs((s) => s.followed)
  // A site sent here to follow (the palette's "Follow this site").
  const [params] = useSearchParams()
  const follow = params.get('follow') ?? ''
  const sections = (Object.keys(CLUSTERS) as ClusterId[]).filter((c) => CLUSTERS[c].pack === 'general')
  return (
    <>
      <p className="mt-2 max-w-xl text-[0.9375rem] text-ink-2">
        Following a topic brings in its publishers. Follow one on its own to get everything it publishes in Publishers, whatever it’s about. Or paste any site: most publish a feed, and PaperWing finds
        it.
      </p>
      <div className="mt-6">
        <FeedFinder key={follow} initial={follow} />
      </div>
      {sections.map((c) => (
        <section key={c} className="mt-10">
          <h2 className="text-[1.125rem] font-bold">{CLUSTERS[c].label}</h2>
          <div className="mt-2 grid grid-cols-1 gap-x-8 lg:grid-cols-2">
            {TOPICS.filter((t) => t.cluster === c).flatMap((t) =>
              t.feeds.flatMap((f) =>
                f.kind === 'rss'
                  ? [
                      <FeedRow
                        key={`${t.id}:${f.url}`}
                        feed={{ url: f.url, title: f.label, site: new URL(f.url).hostname.replace(/^(www|feeds?|rss)\./, ''), posts: 0 }}
                        note={followed.includes(t.id) ? `Already in ${t.label}` : t.label}
                      />,
                    ]
                  : [],
              ),
            )}
          </div>
        </section>
      ))}
    </>
  )
}

/** Your mixes, the ones you follow, and following one by its link. */
function Mixes() {
  const { mixes, followedMixes } = usePrefs()
  const navigate = useNavigate()
  const [link, setLink] = useState('')
  const open = (e: React.FormEvent) => {
    e.preventDefault()
    // A share link (…/mix/<did>/<rkey>) or the mix's at:// URI.
    const m = /mix\/(did:[a-z0-9:._%-]+)\/([a-z2-7]{13})/i.exec(link) ?? /^at:\/\/(did:[a-z0-9:._%-]+)\/[a-z0-9.-]+\.mix\/([a-z2-7]{13})$/i.exec(link.trim())
    if (!m) return toast('That isn’t a mix link', { tone: 'error' })
    navigate(`/mix/${m[1]}/${m[2]}`)
  }
  return (
    <>
      <p className="mt-2 max-w-xl text-[0.9375rem] text-ink-2">
        A mix is a channel you build from anything: topics, publishers, communities, Bluesky feeds, searches. Publish one and it lives in your own Bluesky account, where anyone with the link can
        follow it. It can be a Bluesky feed too.
      </p>
      <section className="mt-8">
        <div className="flex items-center gap-3">
          <h2 className="flex-1 text-[1.125rem] font-bold">Yours</h2>
          <Link className="btn btn-primary" to="/mixes/new">
            <Plus size={15} /> New mix
          </Link>
        </div>
        {!mixes.length && <p className="mt-2 text-[0.875rem] text-ink-3">None yet. Try one for a hobby, a place or a team: a couple of publishers, a community and a search.</p>}
        <div className="mt-2 grid grid-cols-1 gap-x-8 lg:grid-cols-2">
          {mixes.map((m) => (
            <div key={m.id} className="flex items-center gap-3 border-b border-line py-3">
              <Link to={`/t/${mixChannel(m)}`} className="min-w-0 flex-1">
                <p className="truncate text-[0.9375rem] font-semibold">{m.name || 'Untitled mix'}</p>
                <p className="meta">
                  <span>{m.sources.length} sources</span>
                  <span>{m.feed ? 'published, and a Bluesky feed' : m.published ? 'published' : 'private'}</span>
                </p>
              </Link>
              <Link className="btn h-8 flex-none px-3" to={`/mixes/${m.id}`}>
                Edit
              </Link>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-10">
        <h2 className="text-[1.125rem] font-bold">Following</h2>
        <form className="mt-2 flex max-w-md gap-2" onSubmit={open}>
          <input className="input" inputMode="url" autoCapitalize="off" placeholder="Paste a mix link" value={link} onChange={(e) => setLink(e.target.value)} aria-label="Mix link" />
          <button className="btn h-10 flex-none">Open</button>
        </form>
        <div className="mt-2 grid grid-cols-1 gap-x-8 lg:grid-cols-2">
          {followedMixes.map((m) => (
            <div key={m.uri} className="flex items-center gap-3 border-b border-line py-3">
              <Link to={`/t/${mixChannel(m)}`} className="min-w-0 flex-1">
                <p className="truncate text-[0.9375rem] font-semibold">{m.name}</p>
                <p className="meta">
                  <span>by @{m.by}</span>
                  <span>{m.sources.length} sources</span>
                </p>
              </Link>
              <button className="btn h-8 flex-none px-3" onClick={() => unfollowMix(m.uri)}>
                Unfollow
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

export function ExplorePage() {
  const { tab = 'topics' } = useParams()
  // On a phone the tabs run past the edge: keep the open one in view, and the fade says there's more.
  const tabs = useRef<HTMLElement>(null)
  useEffect(() => void tabs.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }), [tab])
  if (!TABS.some((t) => t.id === tab)) return <Navigate to="/explore" replace />
  return (
    <div className="wide-col">
      <div className="mx-auto max-w-[72rem] px-4 py-8 md:px-8">
        <h1 className="text-[1.875rem] font-bold leading-[1.1] tracking-[-0.02em]">Explore</h1>
        <nav
          ref={tabs}
          className="seg mt-4 max-w-full overflow-x-auto [scrollbar-width:none] max-[899px]:[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]"
          aria-label="What to explore"
        >
          {TABS.map((t) => (
            <Link key={t.id} to={t.id === 'topics' ? '/explore' : `/explore/${t.id}`} replace aria-current={tab === t.id ? 'page' : undefined}>
              {t.id === 'communities' && <Users size={14} />}
              {t.label}
            </Link>
          ))}
        </nav>
        {(tab as Tab) === 'topics' && <TopicsBody />}
        {tab === 'communities' && <Communities />}
        {tab === 'feeds' && <BlueskyFeedsTab />}
        {tab === 'publishers' && <Publishers />}
        {tab === 'mixes' && <Mixes />}
        {tab === 'boards' && <BoardDirectory />}
      </div>
    </div>
  )
}
