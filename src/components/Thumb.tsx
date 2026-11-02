import { Play } from 'lucide-react'
import { useState } from 'react'
import type { Story } from '../lib/types'

// Sources whose preview images are text cards (paper titles, repo names), unreadable at this size.
const NO_LOOKUP = new Set(['arxiv', 'hf', 'github', 'release'])
const NO_LOOKUP_HOSTS = /(^|\.)(github\.com|arxiv\.org|bsky\.app)$/
const saveData = typeof navigator !== 'undefined' && !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData

/** Where a row's picture comes from: the source's own image, else the link's preview image. */
export function thumbFor(s: Pick<Story, 'source' | 'url' | 'thumbnail' | 'media'> & { alsoOn?: Story[]; coverage?: Story[] }): string | undefined {
  if (saveData) return undefined
  const known = s.thumbnail ?? s.media?.[0]?.thumb ?? [...(s.alsoOn ?? []), ...(s.coverage ?? [])].find((a) => a.thumbnail)?.thumbnail
  if (known) return known
  let host = ''
  try {
    host = s.url ? new URL(s.url).hostname : ''
  } catch {
    /* not a URL */
  }
  if (!s.url || !host || NO_LOOKUP.has(s.source) || NO_LOOKUP_HOSTS.test(host) || /\.pdf(\?|$)/i.test(s.url)) return undefined
  return `/api/feed?src=og&url=${encodeURIComponent(s.url)}`
}

export function Thumb({ src, video, blur }: { src: string; video?: boolean; blur?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <span className={`row-thumb${blur ? ' blurred' : ''}`} aria-hidden>
      <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      {video && (
        <span className="row-thumb-play">
          <Play size={14} fill="currentColor" />
        </span>
      )}
    </span>
  )
}
