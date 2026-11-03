import { Play } from 'lucide-react'
import type { Media } from '../lib/types'

// Safari (and so every iOS browser and the installed PWA) plays Bluesky's HLS video natively.
// Elsewhere the poster links out rather than pulling in a 100KB player. Plain files (Mastodon) play anywhere.
export const nativeHls = typeof document !== 'undefined' && !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl')

interface Props {
  media: Media[]
  /** Where video plays when this browser can't. */
  href?: string | null
  /** Smaller, for replies. */
  compact?: boolean
}

/** One image keeps its shape; two to four sit in a cropped grid. Tapping opens the full-size image. */
export function MediaGallery({ media, href, compact }: Props) {
  const max = compact ? 'max-h-64' : 'max-h-[32rem]'
  const video = media.find((m) => m.kind === 'video')
  if (video) {
    const style = { aspectRatio: video.aspect ?? 16 / 9 }
    if (video.playlist && (nativeHls || !/\.m3u8(\?|$)/.test(video.playlist))) {
      return <video className={`media-frame w-full ${max}`} style={style} src={video.playlist} poster={video.thumb} controls playsInline preload="none" aria-label={video.alt ?? 'Video'} />
    }
    return (
      <a className={`media-frame relative block w-full ${max}`} style={style} href={href ?? undefined} target="_blank" rel="noopener noreferrer" title="Play on the original post">
        <img src={video.thumb} alt={video.alt ?? 'Video'} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-14 place-items-center rounded-full bg-ink/70 text-ground">
            <Play size={24} fill="currentColor" aria-hidden />
          </span>
        </span>
      </a>
    )
  }

  const images = media.slice(0, 4)
  if (images.length === 1) {
    const [m] = images
    return (
      <a className={`media-frame block w-fit max-w-full ${max}`} href={m.full ?? m.thumb} target="_blank" rel="noopener noreferrer">
        <img
          src={m.thumb}
          alt={m.alt ?? ''}
          loading="lazy"
          decoding="async"
          className={`block h-auto max-w-full object-contain ${max}`}
          style={m.aspect ? { aspectRatio: m.aspect } : undefined}
          title={m.alt}
        />
      </a>
    )
  }
  return (
    <div className={`grid grid-cols-2 gap-1.5 ${compact ? 'max-w-md' : ''}`}>
      {images.map((m, i) => (
        <a key={i} className={`media-frame block aspect-square ${images.length === 3 && i === 0 ? 'row-span-2 aspect-auto' : ''}`} href={m.full ?? m.thumb} target="_blank" rel="noopener noreferrer">
          <img src={m.thumb} alt={m.alt ?? ''} loading="lazy" decoding="async" className="h-full w-full object-cover" title={m.alt} />
        </a>
      ))}
    </div>
  )
}

export function mediaLabel(media: Media[]): string {
  if (media.some((m) => m.kind === 'video')) return 'Video'
  return media.length === 1 ? 'Image' : `${media.length} images`
}
