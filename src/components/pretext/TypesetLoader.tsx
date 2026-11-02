import { useEffect, useRef } from 'react'
import { loadPretext } from '../../lib/pretext/engine'

type Pretext = Awaited<ReturnType<typeof loadPretext>>

// While a feed loads: the names of the places PaperWing is reading drop one by one into a justified
// block, like type being set in a composing stick, then clear and set again. Pretext gives every
// word's place in the block before a single one is drawn, so each can fall straight into it.

const SOURCES = ['Hacker News', 'Lobsters', 'Bluesky', 'Mastodon', 'Lemmy', 'dev.to', 'arXiv', 'GitHub', 'releases', 'blogs', 'status pages', 'papers']
const LINE = 34
const DROP = 420
const GAP = 85

interface Placed {
  word: string
  x: number
  y: number
}

/** Justified word positions: every line but the last stretched to the full width. */
function setType(pt: Pretext, words: string[], font: string, width: number): Placed[] {
  const text = words.join(' ')
  const p = pt.prepareWithSegments(text, font)
  const { lines } = pt.layoutWithLines(p, width, LINE)
  const out: Placed[] = []
  lines.forEach((line, li) => {
    // The line as words and the spaces between them (word: ''), with pretext's widths.
    const parts: { word: string; w: number }[] = []
    const end = line.end.graphemeIndex > 0 ? line.end.segmentIndex + 1 : line.end.segmentIndex
    for (let i = line.start.segmentIndex; i < end; i++) {
      const prev = parts[parts.length - 1]
      if (p.kinds[i] === 'space') parts.push({ word: '', w: p.widths[i] })
      else if (prev?.word) {
        // Segments with no space between them ("dev." + "to") are one word.
        prev.word += p.segments[i]
        prev.w += p.widths[i]
      } else parts.push({ word: p.segments[i], w: p.widths[i] })
    }
    // A space hanging off the end of a line isn't a gap to stretch.
    while (parts.length && !parts[parts.length - 1].word) parts.pop()
    const gaps = parts.filter((x) => !x.word).length
    const last = li === lines.length - 1
    const stretch = !last && gaps ? (width - line.width) / gaps : 0
    let x = 0
    for (const part of parts) {
      if (part.word) out.push({ word: part.word, x, y: li * LINE })
      x += part.w + (part.word ? 0 : stretch)
    }
  })
  return out
}

const shuffle = <T,>(a: T[]) => {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

export function TypesetLoader({ label }: { label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvas.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    let raf = 0
    let alive = true
    const family = getComputedStyle(cv).getPropertyValue('--font-mark').trim() || 'monospace'
    const font = `800 24px ${family}`
    const color = getComputedStyle(cv).color
    let pt: Pretext | undefined
    let placed: Placed[] = []
    let started = 0
    let width = 0

    const reset = () => {
      const dpr = devicePixelRatio || 1
      width = cv.clientWidth
      placed = setType(pt!, shuffle(SOURCES).slice(0, 8), font, width)
      const height = (Math.max(...placed.map((p) => p.y)) + LINE + 8) | 0
      cv.style.height = `${height}px`
      cv.width = width * dpr
      cv.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      started = performance.now()
    }

    const draw = (now: number) => {
      if (!alive) return
      if (cv.clientWidth !== width) reset()
      const t = now - started
      const settled = placed.length * GAP + DROP
      const fade = Math.max(0, Math.min(1, (t - settled - 700) / 300))
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.font = font
      ctx.textBaseline = 'top'
      ctx.fillStyle = color
      placed.forEach((p, i) => {
        const k = Math.max(0, Math.min(1, (t - i * GAP) / DROP))
        if (k === 0) return
        // Falls in from above and settles with a small bounce.
        const back = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2)
        ctx.globalAlpha = Math.min(1, k * 2) * (1 - fade)
        ctx.fillText(p.word, p.x, p.y + 4 - (1 - back) * 40)
      })
      ctx.globalAlpha = 1
      if (fade >= 1) reset()
      raf = requestAnimationFrame(draw)
    }

    void Promise.all([loadPretext(), document.fonts?.load(font)]).then(([m]) => {
      if (!alive) return
      pt = m
      reset()
      raf = requestAnimationFrame(draw)
    })
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="px-4 pb-2 pt-5" role="status">
      <p className="mb-2 text-[0.8125rem] font-semibold text-ink-3">Setting the type for {label}…</p>
      <canvas ref={canvas} className="block w-full text-ink" aria-hidden />
    </div>
  )
}
