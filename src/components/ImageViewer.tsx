import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { Media } from '../lib/types'
import { webUrl } from '../lib/webUrl'

/** Mounted only while open. The native modal keeps focus and page gestures behind the viewer. */
export default function ImageViewer({ images, start, onClose }: { images: Media[]; start: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const [index, setIndex] = useState(start)
  const move = (step: number) => {
    // Changing images replaces the retry button too. Keep its focus inside the modal.
    if (dialog.current?.querySelector('figure')?.contains(document.activeElement)) dialog.current.focus()
    setIndex((i) => Math.max(0, Math.min(images.length - 1, i + step)))
  }
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const modal = dialog.current!
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    modal.showModal()
    return () => {
      modal.close()
      document.body.style.overflow = overflow
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])
  const image = images[index]
  const original = webUrl(image.full ?? image.thumb)
  return createPortal(
    <dialog
      ref={dialog}
      className="image-viewer"
      aria-label="Image viewer"
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          move(e.key === 'ArrowLeft' ? -1 : 1)
        }
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <p role="status" aria-live="polite" aria-atomic="true" className="text-sm tabular-nums">
          {index + 1} of {images.length}
        </p>
        <div className="flex items-center gap-4">
          {original && (
            <a href={original} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-4">
              Open original
            </a>
          )}
          <button type="button" className="image-viewer-button" aria-label="Close image viewer" onClick={onClose} autoFocus>
            <X size={24} aria-hidden />
          </button>
        </div>
      </div>
      <figure className="image-viewer-figure">
        <div
          className="image-viewer-stage"
          onTouchStart={(e) => {
            touch.current = !(e.target as Element).closest('button') && e.touches.length === 1 && (window.visualViewport?.scale ?? 1) <= 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null
          }}
          onTouchMove={(e) => {
            if (e.touches.length !== 1) touch.current = null
          }}
          onTouchCancel={() => {
            touch.current = null
          }}
          onTouchEnd={(e) => {
            const from = touch.current
            touch.current = null
            if (!from || e.touches.length || (window.visualViewport?.scale ?? 1) > 1) return
            const dx = e.changedTouches[0].clientX - from.x
            const dy = e.changedTouches[0].clientY - from.y
            if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.4) move(dx < 0 ? 1 : -1)
          }}
        >
          <ViewerImage key={index} image={image} />
        </div>
        {image.alt && <figcaption className="image-viewer-caption">{image.alt}</figcaption>}
      </figure>
      {images.length > 1 && (
        <nav aria-label="Images" className="flex items-center justify-center gap-6">
          <button type="button" className="image-viewer-button" aria-label="Previous image" aria-disabled={index === 0} onClick={() => move(-1)}>
            <ChevronLeft size={24} aria-hidden />
          </button>
          <span className="text-sm">Swipe or use the arrows</span>
          <button type="button" className="image-viewer-button" aria-label="Next image" aria-disabled={index === images.length - 1} onClick={() => move(1)}>
            <ChevronRight size={24} aria-hidden />
          </button>
        </nav>
      )}
    </dialog>,
    document.body,
  )
}

function ViewerImage({ image }: { image: Media }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  return (
    <>
      {state === 'loading' && <p className="image-viewer-message">Loading image…</p>}
      {state === 'failed' ? (
        <div className="image-viewer-message text-center">
          <p>This image couldn’t load.</p>
          <button
            type="button"
            className="mt-4 rounded-lg border px-4 py-3"
            onClick={(e) => {
              e.currentTarget.closest('dialog')?.focus()
              setState('loading')
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <img
          src={image.full ?? image.thumb}
          alt={image.alt || 'Image'}
          draggable={false}
          onLoad={() => setState('ready')}
          onError={() => setState('failed')}
          style={{ visibility: state === 'loading' ? 'hidden' : undefined }}
        />
      )}
    </>
  )
}
