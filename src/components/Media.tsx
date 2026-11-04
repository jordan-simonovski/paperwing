import { Play } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import type { Media } from '../lib/types'

const ImageViewer = lazy(() => import('./ImageViewer'))

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
  const [selected, setSelected] = useState<{ images: Media[]; start: number } | null>(null)
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

  const images = media.filter((m) => m.kind === 'image')
  const open = (index: number) => ({
    'aria-label': `Open image ${index + 1} of ${images.length}${images[index].alt ? `: ${images[index].alt}` : ''}`,
    onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      e.stopPropagation()
      e.currentTarget.focus({ preventScroll: true })
      setSelected({ images, start: index })
    },
  })
  const viewer = selected !== null && (
    <Suspense fallback={null}>
      <ImageViewer {...selected} onClose={() => setSelected(null)} />
    </Suspense>
  )
  if (images.length === 1) {
    const [m] = images
    return (
      <>
        <a {...open(0)} className={`media-frame block w-fit max-w-full ${max}`} href={m.full ?? m.thumb} target="_blank" rel="noopener noreferrer">
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
        {viewer}
      </>
    )
  }
  return (
    <div className={`grid grid-cols-2 gap-1.5 ${compact ? 'max-w-md' : ''}`}>
      {images.slice(0, 4).map((m, i) => (
        <a
          {...open(i)}
          key={i}
          className={`media-frame relative block aspect-square ${images.length === 3 && i === 0 ? 'row-span-2 aspect-auto' : ''}`}
          href={m.full ?? m.thumb}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img src={m.thumb} alt={m.alt ?? ''} loading="lazy" decoding="async" className="h-full w-full object-cover" title={m.alt} />
          {i === 3 && images.length > 4 && (
            <span className="absolute inset-0 grid place-items-center bg-black/60 text-2xl font-semibold text-white" aria-hidden>
              +{images.length - 4}
            </span>
          )}
        </a>
      ))}
      {viewer}
    </div>
  )
}

export function mediaLabel(media: Media[]): string {
  if (media.some((m) => m.kind === 'video')) return 'Video'
  return media.length === 1 ? 'Image' : `${media.length} images`
}
