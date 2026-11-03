import { RefreshCw, WifiOff } from 'lucide-react'
import { Pip } from './Pip'
import { TopicChip } from './TopicTag'

// What a list says when it has nothing to show, and what to do about it. Every state offers a way
// on: try again, clear the filter, or a related topic. Never just a description of the problem.

/** Every source of a channel failed (or there's no connection and nothing cached). */
export function FeedFailed({ offline, statuses, onRetry }: { offline: boolean; statuses: { id: string; label: string; error?: string }[]; onRetry: () => void }) {
  return (
    <div className="px-6 py-16 text-center">
      {offline && <WifiOff className="mx-auto mb-3 text-ink-3" size={22} aria-hidden />}
      <p className="text-[1.125rem] font-bold">{offline ? 'You’re offline' : 'Couldn’t reach this channel’s sources'}</p>
      <p className="mx-auto mt-2 max-w-sm text-[0.9375rem] text-ink-3">
        {offline
          ? 'Nothing here is saved on this device yet. It fills in as soon as you’re back online; your saved stories still work.'
          : 'Usually a passing hiccup, at their end or with the connection. Try again in a moment.'}
      </p>
      <button className="btn mt-5 inline-flex" onClick={onRetry}>
        <RefreshCw size={15} /> Try again
      </button>
      {!offline && statuses.length > 0 && (
        <details className="mx-auto mt-6 max-w-md text-left text-[0.875rem] text-ink-3">
          <summary className="cursor-pointer text-center">What each source said</summary>
          <ul className="mt-2 space-y-1">
            {statuses.map((s) => (
              <li key={s.id}>
                <span className="font-semibold text-ink-2">{s.label}</span>: {s.error ?? 'No answer'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/** The sources answered, but there's nothing to show. */
export function FeedEmpty({
  quiet,
  filtered,
  allRead,
  related = [],
  onClearFilter,
  onRefresh,
}: {
  /** The channel's own words for having nothing yet. */
  quiet?: string
  /** A source or kind filter is on, and nothing matches it. */
  filtered: boolean
  /** Everything here has been read, and read stories are hidden. */
  allRead: boolean
  related?: string[]
  onClearFilter: () => void
  onRefresh: () => void
}) {
  const [title, body] = filtered
    ? ['Nothing matches this filter', 'The stories here come from other places right now.']
    : allRead
      ? ['You’re all caught up', 'You’ve read everything here. New stories show up as they come in.']
      : ['Nothing here right now', quiet ?? 'Its sources had nothing new. Check back soon, or try something nearby.']
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-[1.125rem] font-bold">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-[0.9375rem] text-ink-3">{body}</p>
      <div className="mt-5 flex justify-center gap-2">
        {filtered ? (
          <button className="btn" onClick={onClearFilter}>
            Show everything
          </button>
        ) : (
          <button className="btn" onClick={onRefresh}>
            <RefreshCw size={15} /> Refresh
          </button>
        )}
      </div>
      {!filtered && related.length > 0 && (
        <div className="mt-6">
          <p className="text-[0.8125rem] font-semibold text-ink-3">Or try a related topic</p>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {related.slice(0, 5).map((id) => (
              <TopicChip key={id} id={id} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The Saved queue, read through: everything saved has been finished. Pip shuts the book as on
 * Today's last story, and hops once only when the queue emptied while you watched.
 */
export function QueueCleared({ archived, settle = false, onArchive }: { archived: number; settle?: boolean; onArchive: () => void }) {
  return (
    <div className="px-6 py-14 text-center">
      <Pip variant="done" className={`mx-auto block size-24 ${settle ? 'pip-settle' : ''}`} />
      <p className="mt-1 text-[1.125rem] font-bold">Queue cleared</p>
      <p className="mx-auto mt-2 max-w-sm text-[0.9375rem] text-ink-3">
        Nothing left waiting. The next story you save lands here, and{' '}
        {archived === 1 ? (
          'the one you’ve finished is in the archive.'
        ) : (
          <>
            the <span className="num">{archived}</span> you’ve finished are in the archive.
          </>
        )}
      </p>
      <button className="btn mt-5" onClick={onArchive}>
        Open the archive
      </button>
    </div>
  )
}

/** One part of a page couldn't load: say which, in plain words, with a way to try again. */
export function CouldntReach({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.875rem] text-ink-2">
      Couldn’t reach {what} just now.
      <button className="btn h-8 px-3 text-[0.8125rem]" onClick={onRetry}>
        <RefreshCw size={14} /> Try again
      </button>
    </p>
  )
}
