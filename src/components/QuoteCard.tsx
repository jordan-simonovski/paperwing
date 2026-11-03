import { timeAgo } from '../lib/format'
import { sanitize } from '../lib/html'
import type { Quote } from '../lib/types'
import { webUrl } from '../lib/webUrl'
import { MediaGallery } from './Media'

/**
 * A quoted post inside a post or comment, the way Bluesky and Mastodon show one: who wrote it, its
 * words, its pictures. Tapping it opens it in the reader when it can be, else on its own site.
 */
export function QuoteCard({ quote, onOpen }: { quote: Quote; onOpen?: (key: string) => void }) {
  if (quote.gone) return <p className="quote-card text-[0.875rem] text-ink-3">The quoted post is unavailable.</p>
  const open = (e: React.MouseEvent | React.KeyboardEvent) => {
    // Links inside the quote go where they point.
    if ((e.target as Element).closest('a')) return
    if (quote.key && onOpen) onOpen(quote.key)
    else if (webUrl(quote.url)) window.open(quote.url, '_blank', 'noopener')
  }
  let host: string | undefined
  try {
    host = quote.link ? new URL(quote.link.url).hostname.replace(/^www\./, '') : undefined
  } catch {
    host = undefined
  }
  return (
    <div className="quote-card" role="link" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open(e)}>
      <p className="flex min-w-0 items-baseline gap-1.5 text-[0.8125rem]">
        {quote.name && <span className="truncate font-semibold text-ink">{quote.name}</span>}
        <span className="truncate text-ink-3">@{quote.author}</span>
        {quote.createdAt && <span className="ml-1 flex-none text-ink-3">{timeAgo(quote.createdAt)}</span>}
      </p>
      {quote.html && <div className="prose-c mt-1" dangerouslySetInnerHTML={{ __html: sanitize(quote.html) }} />}
      {quote.media && (
        <div className="mt-2">
          <MediaGallery media={quote.media} href={quote.url} compact />
        </div>
      )}
      {quote.link && (
        <a className="mt-2 block truncate text-[0.8125rem] font-semibold text-ink-2 hover:text-ink" href={quote.link.url} target="_blank" rel="noopener noreferrer">
          {quote.link.title ?? host} {quote.link.title && host && <span className="ml-2 font-normal text-ink-3">{host}</span>}
        </a>
      )}
    </div>
  )
}
