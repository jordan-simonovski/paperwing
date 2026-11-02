import { drawPip, pipColors, pipShapes, PIP_VIEWBOX, type PipColors } from './pip'
import { currentSeason, type Season } from './season'
import { usePrefs } from './store'

// The launch splash on phones: a paper plane (the PaperWing) swoops in and skims along the line,
// dropping each letter of the wordmark into place as it passes, loops back over the top and lands
// where the mark goes, then unfolds into a creased sheet that flips over into Pip. The logo glides
// up into the header as the splash fades, handing over to the real one. The flight differs a
// little every launch, and the time of day and the season leave their mark (moodOf). Part of
// pretext motion: off with it, under reduced motion, and after the first launch of a session. A tap
// skips it.

const TEXT_FAMILY = '"Atkinson Hyperlegible Next Variable", sans-serif'
/** The wordmark's face (styles.css, .wordmark). */
const WORD_FAMILY = '"Fraunces Variable", Georgia, serif'
const WEIGHT = 600
const WORD = 'PaperWing'
/** The flight (along the word, then the loop back to land), the unfold, a beat to blink. */
const ALONG = 640
const BACK = 520
const UNFOLD = 420
const SETTLE = 300
const HANDOFF = 480

export type Mood = 'morning' | 'day' | 'evening' | 'night'

/**
 * What the splash looks like at this moment: sleepy at night, a warm glow in the morning, a barrel
 * roll in the evening; and Pip dressed for the season (season.ts), with confetti at New Year.
 * `?splash=night,christmas` on the URL tries one out.
 */
export function moodOf(d: Date, override = ''): { mood: Mood; season?: Season } {
  const h = d.getHours()
  const mood: Mood = h < 5 || h >= 22 ? 'night' : h < 11 ? 'morning' : h >= 17 ? 'evening' : 'day'
  const asked = override.split(',')
  return { mood: (['morning', 'day', 'evening', 'night'] as const).find((o) => asked.includes(o)) ?? mood, season: currentSeason() }
}

function shouldPlay() {
  try {
    if (sessionStorage.getItem('readout:splashed')) return false
    sessionStorage.setItem('readout:splashed', '1')
  } catch {
    return false
  }
  return matchMedia('(max-width: 899px)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches && usePrefs.getState().pretext
}

type Pt = { x: number; y: number }
const clamp = (t: number) => Math.min(1, Math.max(0, t))
const smooth = (t: number) => t * t * (3 - 2 * t)
const easeOut = (t: number) => 1 - (1 - t) ** 3
const cubic = (a: Pt, b: Pt, c: Pt, d: Pt, u: number): Pt => {
  const v = 1 - u
  return { x: v * v * v * a.x + 3 * v * v * u * b.x + 3 * v * u * u * c.x + u * u * u * d.x, y: v * v * v * a.y + 3 * v * v * u * b.y + 3 * v * u * u * c.y + u * u * u * d.y }
}

/** A paper dart seen from the side, nose along +x, `len` long: the upper wing, the keel below, a red tail like Pip's bookmark. */
function drawPlane(ctx: CanvasRenderingContext2D, len: number, c: PipColors, signal: string) {
  const h = len / 2
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(1.2, len / 26)
  ctx.strokeStyle = c.ink
  // Keel.
  ctx.beginPath()
  ctx.moveTo(h, 0)
  ctx.lineTo(-h * 0.56, 0)
  ctx.lineTo(-h * 0.84, h * 0.36)
  ctx.closePath()
  ctx.fillStyle = c.shade
  ctx.fill()
  ctx.stroke()
  // Wing.
  ctx.beginPath()
  ctx.moveTo(h, 0)
  ctx.lineTo(-h, -h * 0.64)
  ctx.lineTo(-h * 0.56, 0)
  ctx.closePath()
  ctx.fillStyle = c.paper
  ctx.fill()
  ctx.stroke()
  // The fold along the wing, and the red tip.
  ctx.beginPath()
  ctx.moveTo(h * 0.9, -h * 0.04)
  ctx.lineTo(-h * 0.78, -h * 0.4)
  ctx.lineWidth = Math.max(1, len / 40)
  ctx.strokeStyle = c.line
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-h, -h * 0.64)
  ctx.lineTo(-h * 0.7, -h * 0.44)
  ctx.lineTo(-h * 0.8, -h * 0.3)
  ctx.closePath()
  ctx.fillStyle = signal
  ctx.fill()
}

/** The plane opened out: a square sheet with its creases, as wide as Pip. */
function drawSheet(ctx: CanvasRenderingContext2D, size: number, c: PipColors) {
  const s = size / 2
  ctx.fillStyle = c.paper
  ctx.strokeStyle = c.line
  ctx.lineWidth = Math.max(1, size / 50)
  ctx.beginPath()
  ctx.rect(-s, -s, size, size)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-s, -s)
  ctx.lineTo(s, s)
  ctx.moveTo(s, -s)
  ctx.lineTo(-s, s)
  ctx.moveTo(0, -s)
  ctx.lineTo(0, s)
  ctx.stroke()
}

/**
 * Plays the splash if it should (or always, with `force`: Settings' replay), and resolves when the
 * app should start: straight away when there's no splash, or once the logo has formed and stands
 * still. The app's first render and its startup work are the heaviest moments of a launch; run
 * under the flight they'd stall it, and the splash covers the screen anyway. The glide to the header
 * is a CSS transition, which keeps moving while the app renders.
 */
export function playSplash(opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force && !shouldPlay()) return Promise.resolve()
  let release!: () => void
  const ready = new Promise<void>((r) => (release = r))
  const { mood, season } = moodOf(new Date(), new URLSearchParams(location.search).get('splash') ?? '')
  // Night flights are slower: a sleepy glide.
  const pace = mood === 'night' ? 1.18 : 1
  const along = ALONG * pace
  const back = BACK * pace
  const landed = along + back
  const unfolded = landed + UNFOLD
  const holdUntil = unfolded + SETTLE
  // However the splash goes, the app starts within a few seconds.
  setTimeout(() => release(), holdUntil + 800)

  const css = getComputedStyle(document.documentElement)
  const ground = css.getPropertyValue('--ground').trim() || '#f4f4f1'
  const signal = css.getPropertyValue('--signal').trim() || '#e5484d'
  const quiet = css.getPropertyValue('--ink-3').trim() || '#888'
  const ink = css.getPropertyValue('--ink').trim() || '#1c1b19'

  // The backdrop and the logo are separate layers, so the fade and the glide to the header can run
  // as compositor transitions, smooth even while the app renders underneath.
  const root = document.createElement('div')
  root.setAttribute('aria-hidden', 'true')
  root.style.cssText = 'position:fixed;inset:0;z-index:200;touch-action:none'
  const backdrop = document.createElement('div')
  backdrop.style.cssText = `position:absolute;inset:0;background:${ground};transition:opacity ${HANDOFF}ms ease-out`
  const cv = document.createElement('canvas')
  cv.style.cssText = `position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;transition:transform ${HANDOFF}ms cubic-bezier(.45,0,.2,1),opacity ${HANDOFF}ms ease-out`
  root.append(backdrop, cv)
  document.body.appendChild(root)
  const remove = () => {
    root.remove()
    release()
  }

  const fontLoad = document.fonts?.load(`${WEIGHT} 64px ${WORD_FAMILY}`)
  const timeout = new Promise((r) => setTimeout(r, 700))
  // A font that fails to load (blocked, offline) or a drawing that throws mustn't leave a blank
  // screen over the app: either way the splash just goes.
  void Promise.race([fontLoad, timeout])
    .catch(() => undefined)
    .then(() => {
      if (!document.fonts?.check(`${WEIGHT} 64px ${WORD_FAMILY}`)) return remove()
      try {
        run()
      } catch {
        remove()
      }
    })

  function run() {
    const W = innerWidth
    const H = innerHeight

    // The splash logo: the header's mark and wordmark, scaled up together, as big as fits (Pip's
    // 30px head and an 11px gap beside a 28px word, as in the phone header).
    const probe = document.createElement('canvas').getContext('2d')!
    probe.font = `${WEIGHT} 100px ${WORD_FAMILY}`
    const perPx = probe.measureText(WORD).width / 100 + 41 / 28
    const size = Math.min(76, (W * 0.84) / perPx)
    const k = size / 28
    const font = `${WEIGHT} ${size}px ${WORD_FAMILY}`
    probe.font = font
    // The word box: 2px either side.
    const wordW = Math.ceil(probe.measureText(WORD).width) + 4
    const wordH = Math.ceil(size * 1.2)
    const markW = 30 * k
    const gap = 11 * k
    const totalW = markW + gap + wordW
    const pip = pipColors()

    // The whole screen this time: the plane flies across it. Only a few shapes a frame, so it's
    // cheap all the same.
    const dpr = Math.min(2, devicePixelRatio || 1)
    cv.width = W * dpr
    cv.height = H * dpr
    Object.assign(cv.style, { width: `${W}px`, height: `${H}px` })
    const ctx = cv.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const markX = Math.round((W - totalW) / 2)
    const wordX = markX + markW + gap
    const wordY = Math.round(H / 2 - wordH / 2 - H * 0.04)
    const mid = wordY + wordH / 2
    const markY = mid - markW / 2
    const markC = { x: markX + markW / 2, y: mid }

    // Each letter's place, so it can drop in as the plane passes over it.
    const letters = [...WORD].map((ch, i) => ({ ch, x: wordX + 2 + probe.measureText(WORD.slice(0, i)).width, w: probe.measureText(ch).width, at: Infinity }))

    // The flight: in from the lower left, skimming just over the word, then a loop back over the
    // top to land on the mark. A little different every launch.
    const j = (v: number, spread = 0.18) => v * (1 + (Math.random() - 0.5) * spread)
    const lift = mood === 'night' ? 0.6 : 1
    const A = [
      { x: -size * 1.5, y: Math.min(H - size, mid + j(size * 4.2, 0.4)) },
      { x: j(W * 0.18), y: mid + j(size * 2.2) },
      { x: wordX + wordW * 0.2, y: mid - size * j(1.25) },
      { x: wordX + wordW + size * 0.5, y: mid - size * 0.85 },
    ]
    const B = [A[3], { x: A[3].x + size * j(1.4), y: mid - size * j(3.2) * lift }, { x: markC.x - size * j(1.8), y: mid - size * j(3.4) * lift }, markC]
    const at = (t: number): { p: Pt; dir: number; u: number; leg: 0 | 1 } => {
      const leg = t < along ? 0 : 1
      const u = leg === 0 ? clamp(t / along) : easeOut(clamp((t - along) / back))
      const pts = leg === 0 ? A : B
      const p = cubic(pts[0], pts[1], pts[2], pts[3], u)
      const q = cubic(pts[0], pts[1], pts[2], pts[3], Math.min(1, u + 0.01))
      const r = u >= 0.995 ? cubic(pts[0], pts[1], pts[2], pts[3], u - 0.01) : p
      const dir = u >= 0.995 ? Math.atan2(p.y - r.y, p.x - r.x) : Math.atan2(q.y - p.y, q.x - p.x)
      return { p, dir, u, leg }
    }
    const blinkAt = unfolded + 140
    const head = pipShapes('head', season)
    const confetti =
      season === 'newyear'
        ? Array.from({ length: 30 }, () => {
            const a = Math.random() * Math.PI * 2
            const s = (90 + Math.random() * 160) * k
            return { vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80 * k, c: ['#e5484d', '#3e63dd', '#30a46c', '#f76b15', '#8e4ec6', '#e2a336'][Math.floor(Math.random() * 6)] }
          })
        : []

    const draw = (t: number) => {
      ctx.clearRect(0, 0, W, H)
      const plane = t < landed ? at(t) : undefined

      // The letters drop into place behind the plane as it passes over each.
      ctx.font = font
      ctx.textBaseline = 'middle'
      // In ink, as in the header: Pip carries the red.
      ctx.fillStyle = ink
      if (t >= unfolded) ctx.fillText(WORD, wordX + 2, mid)
      else
        for (const l of letters) {
          if (l.at === Infinity && plane && (plane.leg === 1 || plane.p.x > l.x + l.w * 0.4)) l.at = t
          const f = smooth(clamp((t - l.at) / 240))
          if (f <= 0) continue
          ctx.globalAlpha = f
          ctx.fillText(l.ch, l.x, mid - (1 - f) * size * 0.35)
        }
      ctx.globalAlpha = 1

      // A pencil-thin trail behind the plane, fading out.
      if (plane) {
        ctx.lineWidth = Math.max(1, k * 0.9)
        ctx.strokeStyle = quiet
        ctx.setLineDash([3 * k, 4 * k])
        for (let i = 0; i < 10; i++) {
          const t0 = t - (i + 1) * 32
          const t1 = t - i * 32
          if (t0 < 0) break
          const a = at(t0).p
          const b = at(t1).p
          ctx.globalAlpha = 0.5 * (1 - i / 10)
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.globalAlpha = 1
      }

      // Morning: a warm glow rises behind Pip as it lands.
      if (mood === 'morning' && t > landed - 200) {
        const g = smooth(clamp((t - landed + 200) / 600))
        const glow = ctx.createRadialGradient(markC.x, markC.y, 0, markC.x, markC.y, markW * 1.25)
        glow.addColorStop(0, `rgba(246, 178, 82, ${0.42 * g})`)
        glow.addColorStop(1, 'rgba(246, 178, 82, 0)')
        ctx.fillStyle = glow
        ctx.fillRect(markC.x - markW * 1.3, markC.y - markW * 1.3, markW * 2.6, markW * 2.6)
      }

      if (plane) {
        ctx.save()
        ctx.translate(plane.p.x, plane.p.y)
        // Coming in to land, it levels out and shrinks to the sheet it'll open into.
        const landing = plane.leg === 1 ? smooth(clamp((plane.u - 0.7) / 0.3)) : 0
        ctx.rotate(plane.dir * (1 - landing))
        // Evening: a barrel roll on the way back.
        const roll = mood === 'evening' && plane.leg === 1 ? Math.cos(smooth(clamp(plane.u / 0.75)) * Math.PI * 2) : 1
        ctx.scale(1 - landing * 0.15, roll * (1 - landing * 0.15))
        // Night: a sleepy bob.
        if (mood === 'night') ctx.translate(0, Math.sin(t / 110) * k * 1.5)
        drawPlane(ctx, 34 * k, pip, signal)
        ctx.restore()
      } else if (t < unfolded) {
        // The unfold: the plane opens into a creased sheet, which flips over into Pip.
        const f = clamp((t - landed) / UNFOLD)
        ctx.save()
        ctx.translate(markC.x, markC.y)
        if (f < 0.5) {
          const open = easeOut(f / 0.5)
          ctx.scale(Math.max(0.05, open), Math.max(0.05, 0.35 + open * 0.65))
          drawSheet(ctx, markW, pip)
        } else {
          const flip = (f - 0.5) / 0.5
          ctx.scale(Math.max(0.02, Math.abs(Math.cos(flip * Math.PI))), 1)
          if (flip < 0.5) drawSheet(ctx, markW, pip)
          else drawPip(ctx, head, PIP_VIEWBOX.head, -markW / 2, -markW / 2, markW / PIP_VIEWBOX.head[2], pip)
        }
        ctx.restore()
      }

      if (t >= unfolded) {
        // Pip, settled: shakes out its tuft and blinks; at night it can barely keep its eyes open.
        const since = t - unfolded
        const pop = since < 200 ? 1 + Math.sin((since / 200) * Math.PI) * 0.08 : 1
        const s = markW * pop
        const blink = mood === 'night' ? 0.55 + Math.max(0, 0.45 - Math.abs(t - blinkAt) / 200) : Math.max(0, 1 - Math.abs(t - blinkAt) / 90)
        drawPip(ctx, head, PIP_VIEWBOX.head, markC.x - s / 2, markC.y - s / 2, s / PIP_VIEWBOX.head[2], pip, { tuft: Math.sin(since / 45) * 8 * Math.max(0, 1 - since / 260), blink })
        if (mood === 'night') {
          ctx.fillStyle = quiet
          for (let i = 0; i < 2; i++) {
            const z = clamp((since - i * 120) / 420)
            if (z <= 0) continue
            ctx.globalAlpha = Math.sin(z * Math.PI)
            ctx.font = `700 ${(9 + i * 3) * k}px ${TEXT_FAMILY}`
            ctx.fillText('z', markX + markW * (0.95 + i * 0.2 + z * 0.15), markY - z * markW * 0.45 - i * markW * 0.12)
          }
          ctx.globalAlpha = 1
        }
      }

      // New Year's Day: confetti from where the plane lands.
      if (confetti.length && t > landed) {
        const dt = (t - landed) / 1000
        ctx.globalAlpha = Math.max(0, 1 - dt / 1.1)
        for (const c of confetti) {
          ctx.fillStyle = c.c
          ctx.fillRect(markC.x + c.vx * dt, markC.y + c.vy * dt + 300 * k * dt * dt, 4 * k, 4 * k)
        }
        ctx.globalAlpha = 1
      }
    }

    // The hand-off: one CSS transform from the splash logo onto the header's, and the backdrop
    // fading. It waits (still showing the formed logo) for the app to put its header on screen.
    let waited = 0
    const handOff = () => {
      const word = document.querySelector<HTMLElement>('.mobile-bar .wordmark')?.getBoundingClientRect()
      if (!word?.width && waited++ < 90) return void requestAnimationFrame(handOff)
      if (word?.width) {
        // The word is drawn 2px into its box, centred on its middle line.
        const s = word.width / (wordW - 4)
        cv.style.transform = `translate(${word.left - (wordX + 2) * s}px, ${word.top + word.height / 2 - mid * s}px) scale(${s})`
      } else cv.style.opacity = '0'
      backdrop.style.opacity = '0'
      setTimeout(remove, HANDOFF + 40)
    }

    let start = performance.now()
    let skipped = false
    root.addEventListener('pointerdown', () => (skipped = true), { once: true })
    const frame = (now: number) => {
      let t = now - start
      // A tap jumps straight to Pip.
      if (skipped && t < unfolded) {
        start -= unfolded - t
        t = unfolded
      }
      draw(t)
      if (t < holdUntil) return void requestAnimationFrame(frame)
      // The logo is formed and still: now the app can start underneath, then the hand-off.
      release()
      requestAnimationFrame(() => requestAnimationFrame(handOff))
    }
    requestAnimationFrame(frame)
  }
  return ready
}
