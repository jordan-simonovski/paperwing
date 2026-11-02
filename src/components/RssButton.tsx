import { Rss } from 'lucide-react'
import { homeOrigin, toast } from '../lib/ui'

/** Copies a feed's RSS address, so it can be followed from any feed reader. */
export function RssButton({ path, label, className = 'icon-btn size-8 flex-none' }: { path: string; label?: string; className?: string }) {
  return (
    <button
      className={className}
      title="RSS feed: follow this in any feed reader"
      aria-label="Copy RSS feed address"
      onClick={() => {
        const url = `${homeOrigin()}${path}`
        void navigator.clipboard.writeText(url).then(
          () => toast('Feed address copied. Paste it into any RSS reader.'),
          () => window.open(url, '_blank', 'noopener'),
        )
      }}
    >
      <Rss size={15} />
      {label}
    </button>
  )
}
