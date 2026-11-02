import type { PreparedTextWithSegments } from '@chenglou/pretext'
import { usePrefs } from '../store'
import { pretextNow } from './engine'

// Pretext motion. Pretext (github.com/chenglou/pretext) lays text out with arithmetic over cached
// glyph widths, so we can ask "where would every word of this headline sit at width w and size s?"
// sixty times a second without touching the DOM. That's what lets a headline re-wrap mid-flight as
// it grows from a feed row into the reader, which the DOM can't do at frame rate.
//
// An animation starts on the words' real positions on screen and ends exactly on their real
// positions at the destination (measured once with Ranges): pretext drives everything in between.
// The overlay is pointer-events: none and lives a fraction of a second.

/** On unless turned off in Settings, Appearance, or the system asks for less motion. */
export const pretextOn = () => usePrefs.getState().pretext && !matchMedia('(prefers-reduced-motion: reduce)').matches

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Typography {
  /** Canvas font shorthand at the destination size. */
  font: string
  size: number
  lineHeight: number
  letterSpacing: number
  color: string
  weight: string
}

export function typographyOf(el: Element): Typography {
  const cs = getComputedStyle(el)
  const size = parseFloat(cs.fontSize)
  const lh = parseFloat(cs.lineHeight)
  const ls = parseFloat(cs.letterSpacing)
  return {
    font: `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`,
    size,
    lineHeight: Number.isFinite(lh) ? lh : size * 1.2,
    letterSpacing: Number.isFinite(ls) ? ls : 0,
    color: cs.color,
    weight: cs.fontWeight,
  }
}

/** The words of an element as the browser actually laid them out: one box per whitespace-separated word. */
export function wordBoxes(el: Element): { words: string[]; boxes: Box[] } {
  const words: string[] = []
  const boxes: Box[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const text = node.data
    for (const m of text.matchAll(/\S+/g)) {
      range.setStart(node, m.index)
      range.setEnd(node, m.index + m[0].length)
      const rects = range.getClientRects()
      const r = rects[0]
      if (!r) continue
      // A word the browser broke across lines: count it from its first piece.
      words.push(m[0])
      boxes.push({ x: r.left, y: r.top, w: r.width, h: r.height })
    }
  }
  return { words, boxes }
}

const prepared = new Map<string, PreparedTextWithSegments>()
function prepare(text: string, t: Typography) {
  const key = `${t.font}|${t.letterSpacing}|${text}`
  let p = prepared.get(key)
  if (!p) {
    p = pretextNow()!.prepareWithSegments(text, t.font, { letterSpacing: t.letterSpacing })
    if (prepared.size > 200) prepared.clear()
    prepared.set(key, p)
  }
  return p
}

/**
 * Where each word sits when the text is wrapped at `width` (at the prepared size), relative to the
 * block's top left: x, and the line it's on. Words are runs between spaces, the same as wordBoxes.
 */
function layoutWords(p: PreparedTextWithSegments, width: number): { x: number; line: number }[] | undefined {
  const out: { x: number; line: number }[] = []
  let line = 0
  let broken = false
  pretextNow()!.walkLineRanges(p, Math.max(1, width), (range) => {
    if (range.start.graphemeIndex > 0) broken = true
    let x = 0
    let inWord = false
    const last = range.end.graphemeIndex > 0 ? range.end.segmentIndex : range.end.segmentIndex - 1
    for (let i = range.start.segmentIndex; i <= last; i++) {
      const kind = p.kinds[i]
      const space = kind === 'space' || kind === 'preserved-space' || kind === 'tab' || kind === 'hard-break'
      if (!space && !inWord) out.push({ x, line })
      inWord = !space
      x += p.widths[i]
    }
    line++
  })
  return broken ? undefined : out
}

let layer: HTMLDivElement | undefined
function overlay() {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div')
    layer.setAttribute('aria-hidden', 'true')
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:80;contain:strict;overflow:hidden'
    document.body.appendChild(layer)
  }
  return layer
}

export interface FlowFrom {
  /** Where the block starts: its top left, width and font size. */
  x: number
  y: number
  w: number
  size: number
  /** The words' real positions at the start, when the text is on screen already. */
  boxes?: Box[]
  opacity?: number
}

export interface FlowOptions {
  /** The element the words end up in. It's hidden while they fly and shown when they land. */
  to: Element
  from: FlowFrom
  duration?: number
  delay?: number
  /** Called once the words have landed and the element is showing again. */
  done?: () => void
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3)
/** Keyframes per flight: enough that the straight lines between them read as a curve. */
const SAMPLES = 24
const mix = (a: number, b: number, k: number) => a + (b - a) * k

/**
 * Flies an element's words from somewhere else into place, re-wrapping them with pretext every
 * frame as the block's width and size change. Returns false, doing nothing, when the text can't be
 * matched word for word (then the element just shows as usual).
 */
export function flowInto({ to, from, duration = 560, delay = 0, done }: FlowOptions): boolean {
  if (!pretextNow()) return false
  const target = to as HTMLElement
  const end = wordBoxes(target)
  if (!end.words.length || end.words.length > 80) return false
  const t = typographyOf(target)
  const text = end.words.join(' ')
  const p = prepare(text, t)
  const box = target.getBoundingClientRect()
  // Pretext's layout at the destination must agree with the browser's word for word.
  const atEnd = layoutWords(p, box.width + 0.5)
  if (!atEnd || atEnd.length !== end.words.length) return false
  if (from.boxes && from.boxes.length !== end.words.length) from = { ...from, boxes: undefined }

  const contentH = end.boxes[0].h
  const halfLeading = (t.lineHeight - contentH) / 2
  const root = overlay()
  const spans = end.words.map((w) => {
    const s = document.createElement('span')
    s.textContent = w
    s.style.cssText = `position:absolute;left:0;top:0;white-space:pre;line-height:normal;transform-origin:0 0;will-change:transform,opacity;font:${t.font};letter-spacing:${t.letterSpacing}px;color:${t.color}`
    root.appendChild(s)
    return s
  })
  const prevVisibility = target.style.visibility
  target.style.visibility = 'hidden'

  // The whole flight is worked out now, a re-layout per sample, and handed to the browser as
  // keyframes: the compositor plays it, so it stays smooth while the app is busy (mounting the
  // reader, rendering a feed). Pretext is what makes computing two dozen layouts up front cheap.
  const startOpacity = from.opacity ?? 1
  const frames: Keyframe[][] = spans.map(() => [])
  let lastGood = atEnd
  for (let n = 0; n <= SAMPLES; n++) {
    const raw = n / SAMPLES
    const e = ease(raw)
    const size = mix(from.size, t.size, e)
    const k = size / t.size
    const width = mix(from.w, box.width, e)
    const ox = mix(from.x, box.x, e)
    const oy = mix(from.y, box.y, e)
    // Pretext at the destination size, for the width scaled back up: the same as laying it out at `size`.
    // A width that splits a word differently from the DOM's count keeps the last layout that matched.
    const laid = layoutWords(p, width / k)
    const words = laid && laid.length === spans.length ? (lastGood = laid) : lastGood
    // Land on the real positions: blend into them over the last stretch, and out of the real
    // starting positions over the first.
    const landing = Math.max(0, (e - 0.8) / 0.2)
    const leaving = from.boxes ? Math.max(0, 1 - e / 0.2) : 0
    for (let i = 0; i < spans.length; i++) {
      const w = words[i]
      let x = ox + w.x * k
      let y = oy + (w.line * t.lineHeight + halfLeading) * k
      if (landing > 0) {
        x = mix(x, end.boxes[i].x, landing)
        y = mix(y, end.boxes[i].y, landing)
      }
      let scale = k
      if (leaving > 0 && from.boxes) {
        const b = from.boxes[i]
        x = mix(x, b.x, leaving)
        y = mix(y, b.y, leaving)
        scale = mix(scale, from.size / t.size, leaving)
      }
      frames[i].push({ offset: raw, transform: `translate(${x}px, ${y}px) scale(${scale})`, opacity: mix(startOpacity, 1, Math.min(1, raw * 3)) })
    }
  }
  const flights = spans.map((s, i) => s.animate(frames[i], { duration, delay, easing: 'linear', fill: 'both' }))
  void flights[flights.length - 1].finished
    .catch(() => {})
    .then(() => {
      for (const s of spans) s.remove()
      target.style.visibility = prevVisibility
      done?.()
    })
  return true
}

/** Waits for the app's fonts, so pretext measures with the faces the page draws with. */
export const fontsReady = () => (document.fonts?.ready ?? Promise.resolve()).then(() => undefined)
