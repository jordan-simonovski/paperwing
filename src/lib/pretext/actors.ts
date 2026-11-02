import { drawPip, PIP_BOUNDS, PIP_HEAD_BOUNDS, PIP_VIEWBOX, pipColors, pipShapes, type PipColors } from '../pip'
import { currentSeason } from '../season'

// What moves through the summary card while Claude reads. Each actor moves itself, says which part
// of a text row it's standing in (the text flows around that), and draws itself. Chosen in
// Settings, Discussion summaries.

export type ReaderKind = 'mascot' | 'bounce' | 'orb'

export interface Actor {
  /** Moves to `now` (ms) in a card `width` by `height`. */
  update: (now: number, width: number, height: number) => void
  /** The stretch of the row from y0 to y1 the actor covers, if it's on that row. */
  blocks: (y0: number, y1: number) => [number, number] | undefined
  /** Its middle, in the card's coordinates: the summary pours out of here. */
  centre: () => { x: number; y: number }
  draw: (ctx: CanvasRenderingContext2D) => void
}

export interface ActorColors {
  ink: string
  page: string
  red: string
  /** The wordmark's face. */
  markFont: string
}

const PAD = 8

/**
 * Pip, the paper owl, waddling a slow loop through the text with its book: feet stepping, wings
 * rocking, glancing down to read, blinking now and then.
 */
function mascot(): Actor {
  const colors: PipColors = pipColors()
  // Dressed for the season, like the logo.
  const shapes = pipShapes('full', currentSeason())
  const HEIGHT = 92
  const scale = HEIGHT / PIP_BOUNDS.h
  const w = PIP_BOUNDS.w * scale
  let x = 0
  let y = 0
  let facing = 1
  let phase = 0
  let nextBlink = 1500 + Math.random() * 2000
  let nextRead = 1200 + Math.random() * 1500
  let pose = {}
  return {
    update(now, width, height) {
      const t = now / 1000
      const range = width - w - 12
      x = 6 + range / 2 + Math.sin(t * 0.38) * (range / 2)
      y = (height - HEIGHT) / 2 + Math.sin(t * 0.8) * Math.max(0, (height - HEIGHT) / 2 - 2)
      facing = Math.cos(t * 0.38) >= 0 ? 1 : -1
      // A waddle: one step per beat, the body lifting between.
      const speed = Math.abs(Math.cos(t * 0.38))
      phase += speed * 0.11
      const beat = Math.sin(phase * Math.PI)
      if (now > nextBlink + 180) nextBlink = now + 2200 + Math.random() * 2800
      const blinkT = (now - nextBlink) / 180
      const reading = now > nextRead && now < nextRead + 2200
      if (now > nextRead + 2200) nextRead = now + 2500 + Math.random() * 2500
      // Reading: eyes down at the book, scanning a line across and back.
      const scan = reading ? Math.sin(((now - nextRead) / 2200) * Math.PI * 4) * 6 : 0
      pose = {
        facing,
        step: speed > 0.15 ? (Math.floor(phase) % 2 === 0 ? 1 : 2) : 0,
        lift: speed > 0.15 ? Math.abs(beat) * 8 : 0,
        flap: Math.sin(t * 2.2) * 4 + (speed > 0.15 ? beat * 3 : 0),
        tuft: Math.sin(t * 3.1) * 5,
        blink: blinkT >= 0 && blinkT <= 1 ? Math.sin(blinkT * Math.PI) : 0,
        look: reading ? [scan, 8] : [facing * 4, 0],
      }
    },
    blocks(y0, y1) {
      return y1 > y - PAD / 2 && y0 < y + HEIGHT + PAD / 2 ? [x - PAD, x + w + PAD] : undefined
    },
    centre: () => ({ x: x + w / 2, y: y + HEIGHT / 2 }),
    draw(ctx) {
      // drawPip's origin is the viewBox's; shift so Pip's visible bounds land on (x, y).
      drawPip(ctx, shapes, PIP_VIEWBOX.full, x - (PIP_BOUNDS.x - PIP_VIEWBOX.full[0]) * scale, y - (PIP_BOUNDS.y - PIP_VIEWBOX.full[1]) * scale, scale, colors, pose)
    },
  }
}

/** A glowing orb on a slow figure of eight. */
function orb(c: ActorColors): Actor {
  let ox = 0
  let oy = 0
  let r = 40
  return {
    update(now, width, height) {
      const t = now / 1000
      r = Math.min(46, width * 0.13) * (1 + Math.sin(t * 2.4) * 0.06)
      ox = width / 2 + Math.sin(t * 0.55) * (width / 2 - r - 24)
      oy = height / 2 + Math.sin(t * 1.1) * (height / 2 - r * 0.7)
    },
    blocks(y0, y1) {
      const reach = r + PAD + 2
      const dy = Math.abs((y0 + y1) / 2 - oy)
      if (dy >= reach) return undefined
      const half = Math.sqrt(reach * reach - dy * dy)
      return [ox - half, ox + half]
    },
    centre: () => ({ x: ox, y: oy }),
    draw(ctx) {
      const core = r * 0.62
      const g = ctx.createRadialGradient(ox - core * 0.35, oy - core * 0.4, core * 0.08, ox, oy, core)
      g.addColorStop(0, '#fff')
      g.addColorStop(0.45, c.red)
      g.addColorStop(1, c.red)
      ctx.save()
      ctx.shadowColor = c.red
      ctx.shadowBlur = r * 0.7
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(ox, oy, core, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    },
  }
}

/** Screensaver colours: the logo takes the next one at every wall. */
const SCREENSAVER = ['#e5484d', '#3e63dd', '#30a46c', '#f76b15', '#8e4ec6', '#0091ff', '#d6409f', '#e2a336']

/**
 * The logo bouncing around the card like an old DVD player's screensaver, changing colour at every
 * wall. It hits a corner now and then (more often than the real one ever did), and celebrates.
 */
function bounce(c: ActorColors): Actor {
  const SIZE = 17
  const SPEED = 62
  let x = 10 + Math.random() * 40
  let y = 6 + Math.random() * 30
  let vx = SPEED * (Math.random() < 0.5 ? -1 : 1)
  let vy = SPEED * 0.8 * (Math.random() < 0.5 ? -1 : 1)
  let colour = Math.floor(Math.random() * SCREENSAVER.length)
  let last = 0
  let w = 0
  const h = SIZE + 6
  let cornerAt = -1e9
  let corner = { x: 0, y: 0 }
  // When each wall was last hit: two within a moment of each other is a corner.
  let hitXAt = -1e9
  let hitYAt = -1e9
  let confetti: { x: number; y: number; vx: number; vy: number; c: string }[] = []
  // The mark is Pip's head, as tall as the logo.
  const headScale = (SIZE + 6) / PIP_HEAD_BOUNDS.h
  const markW = PIP_HEAD_BOUNDS.w * headScale
  const gap = SIZE * 0.35
  const pip = pipColors()
  const head = pipShapes('head', currentSeason())

  const nextColour = () => {
    colour = (colour + 1 + Math.floor(Math.random() * (SCREENSAVER.length - 1))) % SCREENSAVER.length
  }
  // Now and then, line the next bounce up with a corner: the screensaver's one great moment.
  const aimForCorner = (width: number, height: number) => {
    if (Math.random() > 0.11) return
    const tx = (vx > 0 ? width - w - x : x) / Math.abs(vx)
    const dy = vy > 0 ? height - h - y : y
    const speed = dy / tx
    if (speed > 25 && speed < 120) vy = Math.sign(vy) * speed
  }

  return {
    update(now, width, height) {
      if (!w) {
        const m = document.createElement('canvas').getContext('2d')!
        m.font = `800 ${SIZE}px ${c.markFont}`
        w = markW + gap + m.measureText('PaperWing').width
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
      x += vx * dt
      y += vy * dt
      let hitX = false
      let hitY = false
      if (x <= 0 || x + w >= width) {
        x = Math.max(0, Math.min(width - w, x))
        vx = -vx
        hitX = true
      }
      if (y <= 0 || y + h >= height) {
        y = Math.max(0, Math.min(height - h, y))
        vy = -vy
        hitY = true
      }
      if (hitX) hitXAt = now
      if (hitY) hitYAt = now
      if (hitX || hitY) {
        nextColour()
        if (Math.abs(hitXAt - hitYAt) < 120 && now - cornerAt > 1000) {
          cornerAt = now
          corner = { x: x < width / 2 ? x : x + w, y: y < height / 2 ? y : y + h }
          confetti = Array.from({ length: 28 }, () => {
            const a = Math.random() * Math.PI * 2
            const s = 60 + Math.random() * 160
            return { x: corner.x, y: corner.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, c: SCREENSAVER[Math.floor(Math.random() * SCREENSAVER.length)] }
          })
          // Back to the usual angle after the celebration.
          vy = Math.sign(vy) * SPEED * 0.8
        } else aimForCorner(width, height)
      }
      for (const p of confetti) {
        p.vy += 260 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
      }
      if (now - cornerAt > 1600) confetti = []
    },
    blocks(y0, y1) {
      return y1 > y - PAD / 2 && y0 < y + h + PAD / 2 ? [x - PAD, x + w + PAD] : undefined
    },
    centre: () => ({ x: x + w / 2, y: y + h / 2 }),
    draw(ctx) {
      const col = SCREENSAVER[colour]
      // The mark: Pip's head, all in the screensaver colour with its face cut out.
      drawPip(ctx, head, PIP_VIEWBOX.head, x - (PIP_HEAD_BOUNDS.x - PIP_VIEWBOX.head[0]) * headScale, y - (PIP_HEAD_BOUNDS.y - PIP_VIEWBOX.head[1]) * headScale, headScale, pip, {
        mono: { colour: col, knockout: c.page },
      })
      ctx.fillStyle = col
      ctx.font = `800 ${SIZE}px ${c.markFont}`
      ctx.textBaseline = 'middle'
      ctx.fillText('PaperWing', x + markW + gap, y + h / 2 + 1)
      // The corner: confetti, and the word.
      const since = last - cornerAt
      if (since < 1600) {
        for (const p of confetti) {
          ctx.globalAlpha = Math.max(0, 1 - since / 1600)
          ctx.fillStyle = p.c
          ctx.fillRect(p.x, p.y, 4, 4)
        }
        const pop = Math.min(1, since / 180)
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, since - 900) / 700)
        ctx.font = `800 ${Math.round(13 + 9 * pop)}px ${c.markFont}`
        ctx.fillStyle = col
        ctx.textAlign = 'center'
        ctx.fillText('CORNER!', x + w / 2, y < 40 ? y + h + 20 : y - 16)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
      }
    },
  }
}

export function createActor(kind: ReaderKind, colors: ActorColors): Actor {
  return kind === 'bounce' ? bounce(colors) : kind === 'orb' ? orb(colors) : mascot()
}
