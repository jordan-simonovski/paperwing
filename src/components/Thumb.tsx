import { Play } from 'lucide-react'
import { useState } from 'react'
import type { Story } from '../lib/types'

// Sources whose preview images are text cards (paper titles, repo names), unreadable at this size.
const NO_LOOKUP = new Set(['arxiv', 'hf', 'github', 'release'])
const NO_LOOKUP_HOSTS = /(^|\.)(github\.com|arxiv\.org|bsky\.app)$/
const saveData = typeof navigator !== 'undefined' && !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData

// Links that turned out to have no picture. A row keeps a slot for its picture while it loads; when
// there's none, the slot goes and the row gets shorter, moving everything below it. Remembering them
// lays those rows out without a slot from then on, so changing topics or coming back doesn't jump.
const NO_PICTURE_KEY = 'readout:no-picture'
const noPicture: Set<string> = (() => {
  try {
    return new Set(JSON.parse(localStorage.getItem(NO_PICTURE_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
})()
let saving = 0
function rememberNoPicture(src: string) {
  // Offline, every picture fails: that says nothing about the link.
  if (!navigator.onLine) return
  noPicture.add(src)
  clearTimeout(saving)
  saving = window.setTimeout(() => {
    try {
      // The most recent ones are enough: a story's picture is looked for while it's in feeds.
      localStorage.setItem(NO_PICTURE_KEY, JSON.stringify([...noPicture].slice(-1500)))
    } catch {
      /* storage full or private mode: remembered for this visit only */
    }
  }, 1000)
}

/** Where a row's picture comes from: the source's own image, else the link's preview image. Undefined when it's known to have none. */
export function thumbFor(s: Pick<Story, 'source' | 'url' | 'thumbnail' | 'media'> & { alsoOn?: Story[]; coverage?: Story[] }): string | undefined {
  if (saveData) return undefined
  const known = s.thumbnail ?? s.media?.[0]?.thumb ?? [...(s.alsoOn ?? []), ...(s.coverage ?? [])].find((a) => a.thumbnail)?.thumbnail
  if (known) return noPicture.has(known) ? undefined : known
  let host = ''
  try {
    host = s.url ? new URL(s.url).hostname : ''
  } catch {
    /* not a URL */
  }
  if (!s.url || !host || NO_LOOKUP.has(s.source) || NO_LOOKUP_HOSTS.test(host) || /\.pdf(\?|$)/i.test(s.url)) return undefined
  const lookup = `/api/feed?src=og&url=${encodeURIComponent(s.url)}`
  return noPicture.has(lookup) ? undefined : lookup
}

export function Thumb({ src, video, blur }: { src: string; video?: boolean; blur?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <span className={`row-thumb${blur ? ' blurred' : ''}`} aria-hidden>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => {
          rememberNoPicture(src)
          setFailed(true)
        }}
      />
      {video && (
        <span className="row-thumb-play">
          <Play size={14} fill="currentColor" />
        </span>
      )}
    </span>
  )
}
