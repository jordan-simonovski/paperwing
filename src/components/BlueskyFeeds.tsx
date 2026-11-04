import { X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { bskyFeedChannel } from '../lib/channels'
import { resolveBlueskyFeed } from '../lib/sources/bluesky'
import { usePrefs } from '../lib/store'
import { toast } from '../lib/ui'

/** Settings: Bluesky custom feeds and lists, each followed as its own channel. No sign-in needed. */
export function BlueskyFeeds() {
  const { bskyFeeds, set } = usePrefs()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="max-w-lg space-y-2">
      {!bskyFeeds.length && <p className="text-sm text-ink-2">No feeds added yet. Add one below or paste a Bluesky feed or list link.</p>}
      {bskyFeeds.map((f) => (
        <div key={f.uri} className="flex items-center gap-3 py-1">
          <Link to={`/t/${bskyFeedChannel(f.uri)}`} className="min-w-0 flex-1">
            <p className="truncate text-[0.9375rem] font-semibold">{f.name}</p>
            <p className="truncate text-[0.8125rem] text-ink-3">{f.uri.includes('/app.bsky.graph.list/') ? 'List' : 'Feed'}</p>
          </Link>
          <Link to={`/t/${bskyFeedChannel(f.uri)}`} className="btn h-9 flex-none px-3" aria-label={`Open ${f.name}`}>
            Open
          </Link>
          <button className="icon-btn flex-none" onClick={() => set({ bskyFeeds: bskyFeeds.filter((x) => x.uri !== f.uri) })} aria-label={`Remove ${f.name}`}>
            <X size={14} />
          </button>
        </div>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          setBusy(true)
          resolveBlueskyFeed(draft)
            .then((feed) => {
              if (!usePrefs.getState().bskyFeeds.some((f) => f.uri === feed.uri)) set({ bskyFeeds: [...usePrefs.getState().bskyFeeds, feed] })
              setDraft('')
              toast(`Added ${feed.name}. Find it in Explore, Bluesky feeds.`, { action: { label: 'Open feed', run: () => navigate(`/t/${bskyFeedChannel(feed.uri)}`) } })
            })
            .catch((err: Error) => toast(err.message, { tone: 'error' }))
            .finally(() => setBusy(false))
        }}
      >
        <input
          className="input"
          autoCapitalize="off"
          autoCorrect="off"
          inputMode="url"
          placeholder="bsky.app/profile/…/feed/… or …/lists/…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Bluesky feed or list link"
        />
        <button className="btn h-10 flex-none" disabled={busy}>
          Add
        </button>
      </form>
    </div>
  )
}
