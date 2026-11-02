import type { LayoutCursor, PreparedTextWithSegments } from '@chenglou/pretext'
import { useEffect, useRef } from 'react'
import { createActor, type ReaderKind } from '../../lib/pretext/actors'
import { loadPretext } from '../../lib/pretext/engine'

// While Claude reads a discussion: the discussion's own words fill the card, and something moves
// through them (the mascot, the bouncing logo, the orb: see actors.ts) while the text re-lays itself
// around it every frame. Each row is split where the actor stands, and pretext fills the space on
// either side one line at a time (layoutNextLine), carrying on from where the last piece stopped,
// so the words part around it as it moves. The same trick as the eye on Ashen Vale's "How this
// works" page.

const FONT_SIZE = 14
const LINE = 21
const ROWS = 8

/** Where the actor was last drawn, in viewport coordinates: the summary pours out of it. */
export let lastActor: { x: number; y: number; at: number } | undefined

export function ReadingAnimation({ text, kind }: { text: string; kind: ReaderKind }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvas.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const cs = getComputedStyle(cv)
    const font = `400 ${FONT_SIZE}px ${cs.getPropertyValue('--font-text').trim() || 'sans-serif'}`
    const ink = cs.color
    const root = getComputedStyle(document.documentElement)
    const actor = createActor(kind, {
      ink: root.getPropertyValue('--ink').trim() || '#111',
      page: root.getPropertyValue('--panel').trim() || '#fff',
      red: root.getPropertyValue('--signal').trim() || '#e5484d',
      markFont: root.getPropertyValue('--font-mark').trim() || 'monospace',
    })
    let prepared: PreparedTextWithSegments | undefined
    let layoutNextLine: Awaited<ReturnType<typeof loadPretext>>['layoutNextLine'] | undefined
    let width = 0
    let raf = 0
    let alive = true
    const height = ROWS * LINE

    const size = () => {
      const dpr = devicePixelRatio || 1
      width = cv.clientWidth
      cv.width = width * dpr
      cv.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const draw = (now: number) => {
      if (!alive || !prepared || !layoutNextLine) return
      if (cv.clientWidth !== width) size()
      actor.update(now, width, height)
      const c = actor.centre()
      const box = cv.getBoundingClientRect()
      lastActor = { x: box.left + c.x, y: box.top + c.y, at: performance.now() }

      ctx.clearRect(0, 0, width, height)
      ctx.font = font
      ctx.textBaseline = 'top'
      ctx.fillStyle = ink
      ctx.globalAlpha = 0.6
      let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
      for (let row = 0; row < ROWS; row++) {
        const y = row * LINE
        // The free spans on this row: all of it, or the parts either side of the actor.
        const blocked = actor.blocks(y, y + LINE)
        const spans: [number, number][] = blocked
          ? [
              [0, blocked[0]],
              [blocked[1], width],
            ]
          : [[0, width]]
        for (const [x0, x1] of spans) {
          if (x1 - x0 < 28) continue
          let line = layoutNextLine(prepared, x1 - x0, cursor)
          if (!line) {
            cursor = { segmentIndex: 0, graphemeIndex: 0 }
            line = layoutNextLine(prepared, x1 - x0, cursor)
            if (!line) break
          }
          // Too narrow for the next whole word: leave the gap empty rather than split it.
          if (line.end.graphemeIndex > 0) continue
          cursor = line.end
          ctx.fillText(line.text, x0, y + 3)
        }
      }
      ctx.globalAlpha = 1
      // The actor, drawn last in the gap the text left it.
      actor.draw(ctx)
      raf = requestAnimationFrame(draw)
    }

    // A font that won't load falls back to the system's; it never stops the animation.
    const fontLoad = (f: string) => document.fonts?.load(f).catch(() => undefined)
    void Promise.all([loadPretext(), fontLoad(font), fontLoad(`800 17px ${root.getPropertyValue('--font-mark').trim() || 'monospace'}`)]).then(([pt]) => {
      if (!alive) return
      layoutNextLine = pt.layoutNextLine
      // Repeated so a short discussion still fills the card.
      prepared = pt.prepareWithSegments(`${text} ${text}`, font)
      size()
      raf = requestAnimationFrame(draw)
    })
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [text, kind])

  return <canvas ref={canvas} className="block w-full text-ink-2" style={{ height: ROWS * LINE }} aria-hidden />
}
