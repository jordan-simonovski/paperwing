import { Check, Loader2, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { findFeeds, follow, isFollowed, useFollowedHosts, useSiteFeeds, useSuggestedBlogs, type FoundFeed } from '../lib/follow'
import { timeAgo } from '../lib/format'
import type { Story } from '../lib/types'

/** In the reader: follow the blog a story comes from, when it has a feed you don't get yet. */
export function FollowSite({ story }: { story: Story }) {
  const hosts = useFollowedHosts()
  const known = story.source === 'rss'
  const feeds = useSiteFeeds(story.url, !known)
  const feed = feeds.data?.[0]
  if (known || !feed || isFollowed(feed, hosts)) return null
  return (
    <button className="pill h-7 px-2.5 text-[0.8125rem]" onClick={() => follow(feed)} title={`Get new posts from ${feed.title} in Blogs`}>
      <Plus size={13} /> Follow {feed.title.length > 28 ? 'this blog' : feed.title}
    </button>
  )
}

export function FeedRow({ feed, note }: { feed: FoundFeed; note?: string }) {
  const hosts = useFollowedHosts()
  const following = isFollowed(feed, hosts)
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9375rem] font-semibold">{feed.title}</p>
        <p className="truncate text-[0.8125rem] text-ink-3">
          {note ?? feed.site}
          {feed.latest ? ` · last post ${timeAgo(feed.latest)} ago` : ''}
        </p>
      </div>
      <button className={`btn h-8 flex-none px-3 ${following ? '' : 'btn-primary'}`} disabled={following} onClick={() => follow(feed)}>
        {following ? (
          <>
            <Check size={14} /> Following
          </>
        ) : (
          <>
            <Plus size={14} /> Follow
          </>
        )}
      </button>
    </div>
  )
}

/** Settings: paste any link to a site (homepage, a post, or the feed) and follow what it publishes. */
export function FeedFinder() {
  const [draft, setDraft] = useState('')
  const [state, setState] = useState<{ status: 'idle' | 'looking' | 'done' | 'failed'; feeds: FoundFeed[]; error?: string }>({ status: 'idle', feeds: [] })
  const find = async () => {
    const url = draft.trim()
    if (!url) return
    setState({ status: 'looking', feeds: [] })
    try {
      setState({ status: 'done', feeds: await findFeeds(url) })
    } catch (err) {
      setState({ status: 'failed', feeds: [], error: err instanceof Error ? err.message : 'Couldn’t reach that site' })
    }
  }
  return (
    <div className="max-w-lg space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void find()
        }}
      >
        <input
          className="input"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="A blog, one of its posts, or its feed"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Site to follow"
        />
        <button className="btn h-10 flex-none" disabled={state.status === 'looking'}>
          {state.status === 'looking' ? <Loader2 size={15} className="spin" /> : <Search size={15} />} Find
        </button>
      </form>
      {state.status === 'done' && !state.feeds.length && <p className="text-[0.8125rem] text-ink-3">No feed found there. Some sites don’t publish one, or block apps from reading it.</p>}
      {state.status === 'failed' && <p className="text-[0.8125rem] text-signal">{state.error}</p>}
      {state.feeds.map((f) => (
        <FeedRow key={f.url} feed={f} note={`${f.site} · ${f.posts} recent posts`} />
      ))}
    </div>
  )
}

/** Settings: the blogs you keep opening stories from, ready to follow. */
export function BlogSuggestions() {
  const suggestions = useSuggestedBlogs()
  if (!suggestions.length) return <p className="text-[0.8125rem] text-ink-3">Open a few posts from the same blog and it shows up here, ready to follow.</p>
  return (
    <div className="max-w-lg">
      {suggestions.map((s) =>
        s.feed ? (
          <FeedRow key={s.host} feed={s.feed} note={`You’ve opened ${s.read} posts from ${s.host}`} />
        ) : (
          <p key={s.host} className="flex items-center gap-2 py-1.5 text-[0.8125rem] text-ink-3">
            <Loader2 size={13} className="spin" /> Looking for {s.host}’s feed…
          </p>
        ),
      )}
    </div>
  )
}
