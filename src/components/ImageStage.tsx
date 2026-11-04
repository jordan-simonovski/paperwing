import { useCallback, useEffect, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { createImageViewport } from '../lib/imageViewport'
import type { Media } from '../lib/types'

/** A stage owns one image's gestures; switching images mounts a fresh view at fit-to-screen. */
export function ImageStage({ image, onSlide }: { image: Media; onSlide: (step: number) => void }) {
  const stage = useRef<HTMLDivElement>(null)
  const size = useRef({ width: image.aspect ?? 1, height: 1 })
  const viewport = useRef(createImageViewport({ width: 0, height: 0, imageWidth: 0, imageHeight: 0 }))
  const [view, setView] = useState(viewport.current.view())
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const sync = () => setView(viewport.current.view())
  const measure = useCallback(() => {
    const el = stage.current
    if (!el) return
    const ratio = Math.min(el.clientWidth / size.current.width, el.clientHeight / size.current.height)
    viewport.current.resize({ width: el.clientWidth, height: el.clientHeight, imageWidth: size.current.width * ratio, imageHeight: size.current.height * ratio })
    setView(viewport.current.view())
  }, [])
  useEffect(() => {
    const observer = new ResizeObserver(measure)
    observer.observe(stage.current!)
    return () => observer.disconnect()
  }, [measure])
  const zoom = (scale: number) => {
    viewport.current.zoom(scale)
    sync()
  }
  const point = (e: React.PointerEvent) => {
    const box = stage.current!.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }
  return (
    <figure className="image-viewer-figure">
      <div className="image-zoom-controls" role="group" aria-label="Image zoom">
        <button type="button" className="image-viewer-button" aria-label="Zoom out" aria-disabled={view.scale === 1 || state !== 'ready'} onClick={() => state === 'ready' && zoom(view.scale / 1.5)}>
          <Minus size={20} aria-hidden />
        </button>
        <span className="min-w-12 text-center text-sm tabular-nums" aria-label={`Zoom ${Math.round(view.scale * 100)} percent`}>
          {Math.round(view.scale * 100)}%
        </span>
        <button type="button" className="image-viewer-button" aria-label="Zoom in" aria-disabled={view.scale === 4 || state !== 'ready'} onClick={() => state === 'ready' && zoom(view.scale * 1.5)}>
          <Plus size={20} aria-hidden />
        </button>
        <button
          type="button"
          className="image-viewer-button"
          aria-label="Reset zoom"
          onClick={() => {
            viewport.current.reset()
            sync()
          }}
        >
          <RotateCcw size={20} aria-hidden />
        </button>
      </div>
      <div
        ref={stage}
        className="image-viewer-stage"
        data-zoom={view.scale}
        onPointerDown={(e) => {
          if ((e.target as Element).closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return
          e.currentTarget.setPointerCapture(e.pointerId)
          viewport.current.down(e.pointerId, point(e))
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
          viewport.current.move(e.pointerId, point(e))
          sync()
        }}
        onPointerUp={(e) => {
          viewport.current.move(e.pointerId, point(e))
          const step = viewport.current.up(e.pointerId)
          sync()
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
          if (step) onSlide(step)
        }}
        onPointerCancel={() => viewport.current.cancel()}
        onLostPointerCapture={(e) => viewport.current.cancel(e.pointerId)}
        onDoubleClick={() => {
          if (state === 'ready') zoom(view.scale > 1 ? 1 : 2)
        }}
      >
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
            onLoad={(e) => {
              size.current = { width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight }
              measure()
              setState('ready')
            }}
            onError={() => setState('failed')}
            style={{ visibility: state === 'loading' ? 'hidden' : undefined, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          />
        )}
      </div>
      {image.alt && <figcaption className="image-viewer-caption">{image.alt}</figcaption>}
    </figure>
  )
}
