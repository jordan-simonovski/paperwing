import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import type { Media } from '../lib/types'
import { webUrl } from '../lib/webUrl'
import { imageFile, saveImage } from '../lib/imageDownload'
import { ImageStage } from './ImageStage'

/** Mounted only while open. The native modal keeps focus and page gestures behind the viewer. */
export default function ImageViewer({ images, start, onClose }: { images: Media[]; start: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
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
        <div className="flex items-center gap-3">
          <ImageDownload src={image.full ?? image.thumb} number={index + 1} hasOriginal={!!original} />
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
      <ImageStage key={index} image={image} onSlide={move} />
      {images.length > 1 && (
        <nav aria-label="Images" className="flex items-center justify-center gap-6">
          <button type="button" className="image-viewer-button" aria-label="Previous image" aria-disabled={index === 0} onClick={() => move(-1)}>
            <ChevronLeft size={24} aria-hidden />
          </button>
          <span className="text-center text-sm">Swipe to browse · Pinch to zoom</span>
          <button type="button" className="image-viewer-button" aria-label="Next image" aria-disabled={index === images.length - 1} onClick={() => move(1)}>
            <ChevronRight size={24} aria-hidden />
          </button>
        </nav>
      )}
    </dialog>,
    document.body,
  )
}

function ImageDownload({ src, number, hasOriginal }: { src: string; number: number; hasOriginal: boolean }) {
  const pending = useRef<AbortController | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle')
  useEffect(() => {
    setState('idle')
    return () => {
      pending.current?.abort()
      pending.current = null
    }
  }, [src])
  const download = async () => {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setState('loading')
    try {
      const file = await imageFile(src, number, AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]))
      if (!controller.signal.aborted) {
        saveImage(file)
        setState('idle')
      }
    } catch {
      if (!controller.signal.aborted) setState('failed')
    } finally {
      if (pending.current === controller) pending.current = null
    }
  }
  return (
    <div className="image-download">
      <button
        type="button"
        className="image-viewer-button"
        aria-label="Download image"
        title="Download image"
        aria-disabled={state === 'loading'}
        aria-busy={state === 'loading'}
        onClick={() => void download()}
      >
        <Download size={22} aria-hidden />
      </button>
      {state === 'failed' && (
        <p className="image-download-error" role="alert">
          Couldn’t download here. {hasOriginal ? 'Open the original image to save it.' : 'Please try again.'}
        </p>
      )}
    </div>
  )
}
