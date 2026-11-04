import { Check, Plus, X } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { topicFeeds } from '../lib/channels'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { planChannel } from '../lib/channelFeed'
import { keys } from '../lib/query'
import { readReader } from '../lib/reader'
import { feedBrand } from '../lib/sources'
import { usePrefs } from '../lib/store'
import { topicIcon } from '../lib/topicIcons'
import { TOPIC_BY_ID, type FeedRef, type Topic } from '../lib/topics'
import type { Story } from '../lib/types'
import { FeedIcon } from './SourceIcon'

// A topic in Explore: its picture, what it's about, the sources behind it, and (when its feeds
// are already on this device) what's leading it right now. Followed topics wear their full colour;
// the rest stay quiet, so your picks stand out on a page of thirty-odd.

const DAY = 86_400_000

/** One logo per publisher, one per network: what the topic actually reads. */
function sourcesOf(t: Topic): { key: string; feed: FeedRef; name: string }[] {
  const seen = new Set<string>()
  const out: { key: string; feed: FeedRef; name: string }[] = []
  for (const f of topicFeeds(t)) {
    const name = feedBrand(f)
    if (seen.has(name)) continue
    seen.add(name)
    out.push({ key: name, feed: f, name })
  }
  // Publishers first: they're what people recognise.
  return out.sort((a, b) => Number(b.feed.kind === 'rss') - Number(a.feed.kind === 'rss'))
}

/** The topic's lead story right now, from feeds this device already has: nothing is fetched for it. */
function cachedLead(qc: QueryClient, t: Topic): Story | undefined {
  const now = Date.now()
  let best: { s: Story; v: number } | undefined
  // The topic's own channel, as its page would fetch it.
  for (const f of planChannel(readReader(), t.id, { sort: 'hot', blueskyEnabled: true })?.feeds ?? []) {
    const data = qc.getQueryData<Story[]>(keys.feed(f.id))
    for (const s of data ?? []) {
      const age = now - s.createdAt
      if (age > DAY || age < 0 || s.warning) continue
      // Engagement where there is some, freshness otherwise.
      const v = (s.score ?? 0) + 2 * (s.comments ?? 0) + (1 - age / DAY) * 5
      if (!best || v > best.v) best = { s, v }
    }
  }
  return best?.s
}

export function TopicCard({ t, dim, onRemove }: { t: Topic; dim?: boolean; onRemove?: () => void }) {
  const on = usePrefs((p) => p.followed.includes(t.id))
  const toggleFollow = usePrefs((p) => p.toggleFollow)
  const Icon = topicIcon(t.id)
  const sources = useMemo(() => sourcesOf(t), [t])
  const qc = useQueryClient()
  const lead = useMemo(() => cachedLead(qc, t), [qc, t])
  const near = t.related.map((r) => TOPIC_BY_ID.get(r)).filter((r): r is Topic => !!r)
  const names = sources.slice(0, 2).map((s) => s.name)

  return (
    <article className={`tcard topic${on ? ' on' : ''}${dim ? ' dim' : ''}`} style={{ '--h': t.hue } as React.CSSProperties}>
      <Icon className="tcard-glyph" aria-hidden strokeWidth={1.5} />
      <div className="flex items-center gap-3">
        <span className="tcard-badge" aria-hidden>
          <Icon size={18} strokeWidth={2} />
        </span>
        <h3 className="min-w-0 flex-1 text-[1.1875rem] font-bold leading-tight tracking-[-0.01em]">
          {/* The whole card opens the topic; the buttons inside sit above this link. */}
          <Link to={`/t/${t.id}`} className="tcard-link">
            {t.label}
          </Link>
        </h3>
        <button
          className="tcard-follow"
          onClick={() => toggleFollow(t.id)}
          aria-pressed={on}
          aria-label={on ? `Following ${t.label}` : `Follow ${t.label}`}
          title={on ? 'Following: tap to unfollow' : 'Follow'}
        >
          {on ? <Check key="on" size={17} strokeWidth={2.5} /> : <Plus key="off" size={17} strokeWidth={2.5} />}
        </button>
      </div>

      <p className="mt-2.5 line-clamp-2 text-[0.875rem] leading-snug opacity-85">{t.blurb}</p>

      {lead && (
        <p className="tcard-now mt-3 line-clamp-2 text-[0.8125rem] leading-snug">
          <span className="font-semibold">Now</span> {lead.title}
        </p>
      )}

      <div className="mt-auto pt-4">
        {sources.length > 0 && (
          <div className="flex items-center gap-2.5">
            <span className="tcard-logos" aria-hidden>
              {sources.slice(0, 5).map((s) => (
                <span key={s.key} className="tcard-logo">
                  <FeedIcon feed={s.feed} size={14} />
                </span>
              ))}
            </span>
            <span className="min-w-0 truncate text-[0.8125rem] opacity-75">
              {names.join(', ')}
              {sources.length > 2 ? ` and ${sources.length - 2} more` : ''}
            </span>
          </div>
        )}
        {(near.length > 0 || onRemove) && (
          <div className="tcard-near mt-2.5 flex items-center gap-1 text-[0.8125rem]">
            {near.length > 0 && <span className="opacity-80">Near</span>}
            <span className="min-w-0 flex-1 truncate">
              {near.slice(0, 3).map((r, i) => (
                <span key={r.id}>
                  {i > 0 && ', '}
                  <Link to={`/t/${r.id}`} className="font-semibold underline-offset-2 hover:underline">
                    {r.label}
                  </Link>
                </span>
              ))}
            </span>
            {onRemove && (
              <button className="icon-btn size-7 flex-none" onClick={onRemove} title="Remove interest" aria-label={`Remove ${t.label}`}>
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
