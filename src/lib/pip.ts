// Pip, PaperWing's paper owl (design/readout-mascot.svg and readout-mascot-icon.svg). The shapes are
// kept here once, tagged with the part of Pip they belong to and the colour role they take, so the
// same owl renders as an inline SVG (components/Pip.tsx) and on a canvas, where the parts move:
// wings flap, feet step, eyes blink and glance, the bookmark tuft bobs.
//
// Colours are roles, not hex: each is a --pip-* variable (styles.css), the designer's palette in
// light mode and a warmer, dimmer paper in dark mode so Pip doesn't glare.

export type PipRole = 'ink' | 'paper' | 'oat' | 'shade' | 'line' | 'signal' | 'tint' | 'blush' | 'shine'
export type PipPart = 'footL' | 'footR' | 'body' | 'tuft' | 'face' | 'eyes' | 'shineL' | 'shineR' | 'brows' | 'cheeks' | 'beak' | 'book' | 'wingL' | 'wingR' | 'hat'

export interface PipShape {
  part: PipPart
  d?: string
  ellipse?: [number, number, number, number]
  fill?: PipRole
  /** A literal colour, for the few seasonal touches outside Pip's palette. */
  paint?: string
  stroke?: PipRole
  width?: number
  round?: boolean
}

const BODY_FULL =
  'M176 130c27 4 44 20 57 40 25-11 55-17 85-17 33 0 63 6 89 18 14-21 31-35 57-39 0 35-6 66-18 88 24 38 37 86 37 135 0 99-62 161-165 161-101 0-163-61-163-160 0-51 13-98 38-135-12-25-17-56-17-91Z'
const BODY_HEAD =
  'M176 130c27 4 44 20 57 40 25-11 55-17 85-17 33 0 63 6 89 18 14-21 31-35 57-39 0 35-6 66-18 88 24 29 37 62 37 95 0 73-66 117-165 117-97 0-163-44-163-116 0-34 13-67 38-95-12-25-17-56-17-91Z'

const HEAD: PipShape[] = [
  { part: 'body', d: 'M180 143c8 38 20 59 41 73l-26 9c-12-24-18-53-15-82Z', fill: 'shade' },
  { part: 'body', d: 'M460 145c-9 36-21 58-41 70l25 13c13-24 18-54 16-83Z', fill: 'shade' },
]
const TUFT: PipShape = { part: 'tuft', d: 'M338 162c-1-28 4-54 17-78 3-5 8-7 13-5l39 17c5 2 7 8 4 13-13 22-22 45-25 71l-20-18-28 0Z', fill: 'signal', stroke: 'ink', width: 9, round: true }
const FACE: PipShape[] = [
  { part: 'face', d: 'M319 231c-23-27-56-40-86-28-36 14-49 50-45 88 5 55 45 91 131 116 86-25 127-61 131-116 4-38-10-74-45-88-31-12-63 1-86 28Z', fill: 'paper' },
  { part: 'face', d: 'M319 232v121', stroke: 'oat', width: 6, round: true },
]
const EYES: PipShape[] = [
  { part: 'eyes', ellipse: [262, 289, 26, 35], fill: 'ink' },
  { part: 'eyes', ellipse: [377, 289, 26, 35], fill: 'ink' },
  { part: 'shineL', ellipse: [254, 278, 8, 10], fill: 'paper' },
  { part: 'shineR', ellipse: [369, 278, 8, 10], fill: 'paper' },
]
const EXPRESSION: PipShape[] = [
  { part: 'cheeks', ellipse: [223, 335, 20, 10], fill: 'blush' },
  { part: 'cheeks', ellipse: [415, 335, 20, 10], fill: 'blush' },
  { part: 'beak', d: 'M306 329q13-10 26 0c5 3 6 7 2 12l-10 15c-3 4-7 4-10 0l-10-15c-4-5-3-9 2-12Z', fill: 'signal' },
]

/** The whole owl, in drawing order. viewBox 0 0 640 640. */
export const PIP_FULL: PipShape[] = [
  { part: 'footL', d: 'M229 489c-13 8-29 22-33 35-3 9 6 14 17 12l42-9 14-32', fill: 'signal', stroke: 'ink', width: 9, round: true },
  { part: 'footR', d: 'M360 493l11 34 44 9c12 2 19-3 16-12-5-14-21-28-35-36', fill: 'signal', stroke: 'ink', width: 9, round: true },
  { part: 'body', d: BODY_FULL, fill: 'oat', stroke: 'ink', width: 10, round: true },
  ...HEAD,
  { part: 'body', d: 'M216 450c24 38 60 53 103 53 48 0 90-22 111-59-33 17-69 23-108 23-39 0-75-5-106-17Z', fill: 'shade' },
  TUFT,
  { part: 'tuft', d: 'M367 94c-9 17-14 32-16 48', stroke: 'tint', width: 7, round: true },
  ...FACE,
  { part: 'face', d: 'M210 255c8-20 22-31 41-32M427 255c-7-20-22-31-41-32', stroke: 'shine', width: 7, round: true },
  ...EYES,
  { part: 'brows', d: 'M243 241c11-7 24-8 35-3M359 238c12-5 25-4 35 3', stroke: 'ink', width: 7, round: true },
  ...EXPRESSION,
  { part: 'book', d: 'M197 405c47-2 85 13 122 36 37-23 75-38 122-36l-9 108c-43 0-78 11-113 30-35-19-70-30-113-30l-9-108Z', fill: 'signal', stroke: 'ink', width: 9, round: true },
  { part: 'book', d: 'M209 389c45 0 79 14 110 36 31-22 65-36 110-36l-7 110c-40 0-72 11-103 30-31-19-63-30-103-30l-7-110Z', fill: 'paper', stroke: 'ink', width: 8, round: true },
  { part: 'book', d: 'M319 426v102', stroke: 'ink', width: 7, round: true },
  {
    part: 'book',
    d: 'M237 423c19 3 36 9 53 18M239 445c18 3 35 9 51 18M241 468c13 3 25 7 37 13M349 441c17-9 34-15 53-18M349 463c16-9 33-15 51-18M349 485c12-6 24-10 37-13',
    stroke: 'line',
    width: 6,
    round: true,
  },
  { part: 'wingL', d: 'M164 350c-22 21-31 58-20 83 9 20 28 28 50 23 19-5 35-22 45-43 3-7-1-14-9-15l-23-2-7-17', fill: 'oat', stroke: 'ink', width: 9, round: true },
  { part: 'wingR', d: 'M475 350c22 21 31 58 20 83-9 20-28 28-50 23-19-5-35-22-45-43-3-7 1-14 9-15l23-2 7-17', fill: 'oat', stroke: 'ink', width: 9, round: true },
  { part: 'wingL', d: 'M171 421c5 9 13 14 23 15', stroke: 'line', width: 6, round: true },
  { part: 'wingR', d: 'M468 421c-5 9-13 14-23 15', stroke: 'line', width: 6, round: true },
]

/** Just the head: the logo. viewBox 130 65 380 380. */
export const PIP_HEAD: PipShape[] = [{ part: 'body', d: BODY_HEAD, fill: 'oat', stroke: 'ink', width: 10, round: true }, ...HEAD, TUFT, ...FACE, ...EYES, ...EXPRESSION]

/**
 * Seasonal hats, in the same coordinates as the head (the full owl's head sits in the same place),
 * so one set dresses the logo, the splash and the mascot. Each replaces the bookmark tuft.
 */
const ink = { stroke: 'ink' as const, width: 9, round: true }
export const PIP_HATS: Record<'christmas' | 'halloween' | 'newyear' | 'valentine' | 'easter', PipShape[]> = {
  christmas: [
    { part: 'hat', d: 'M222 176C226 110 300 66 380 70C440 74 478 96 488 118C462 112 440 124 430 146L424 172Z', fill: 'signal', ...ink },
    { part: 'hat', d: 'M224 160h198a18 18 0 0 1 0 36h-198a18 18 0 0 1 0-36Z', fill: 'paper', ...ink },
    { part: 'hat', ellipse: [490, 120, 24, 24], fill: 'paper', ...ink },
  ],
  halloween: [
    { part: 'hat', ellipse: [320, 178, 178, 30], paint: '#4a2b6b', ...ink },
    { part: 'hat', d: 'M236 174C262 120 300 40 360 18C352 50 372 92 404 170Z', paint: '#4a2b6b', ...ink },
    { part: 'hat', d: 'M252 146C300 158 350 158 392 144L400 166C350 180 296 180 242 168Z', paint: '#f08a24' },
  ],
  newyear: [
    { part: 'hat', d: 'M262 174L330 30L398 174Z', paint: '#3e63dd', ...ink },
    { part: 'hat', ellipse: [318, 112, 9, 9], paint: '#f5c542' },
    { part: 'hat', ellipse: [348, 146, 9, 9], paint: '#f5c542' },
    { part: 'hat', ellipse: [298, 154, 9, 9], paint: '#f5c542' },
    { part: 'hat', ellipse: [336, 74, 8, 8], paint: '#f5c542' },
    { part: 'hat', ellipse: [330, 26, 20, 20], paint: '#f5c542', ...ink },
  ],
  valentine: [{ part: 'hat', d: 'M330 166C270 126 258 74 294 64C314 58 326 72 330 86C334 72 346 58 366 64C402 74 390 126 330 166Z', fill: 'signal', ...ink }],
  easter: [
    { part: 'hat', d: 'M262 172C230 120 222 40 252 20C282 4 300 70 300 164Z', fill: 'paper', ...ink },
    { part: 'hat', d: 'M268 150C252 112 248 62 258 46C270 36 282 82 286 150Z', fill: 'blush' },
    { part: 'hat', d: 'M378 172C410 120 418 40 388 20C358 4 340 70 340 164Z', fill: 'paper', ...ink },
    { part: 'hat', d: 'M372 150C388 112 392 62 382 46C370 36 358 82 354 150Z', fill: 'blush' },
  ],
}

/** Pip when the edition's finished: the book shut and held to its chest, eyes closed in a smile. Same viewBox as PIP_FULL. */
export const PIP_DONE: PipShape[] = (() => {
  const closedBook: PipShape[] = [
    // The page block, peeking out below and to the right of the cover.
    { part: 'book', d: 'M240 394h160a6 6 0 0 1 6 6v84a6 6 0 0 1-6 6h-160Z', fill: 'paper', stroke: 'ink', width: 8, round: true },
    { part: 'book', d: 'M250 484h146', stroke: 'line', width: 5, round: true },
    // The bookmark ribbon, hanging out of the pages: it's a book, not a tablet.
    { part: 'book', d: 'M292 468v46l12-10 12 10v-46Z', fill: 'tint', stroke: 'ink', width: 6, round: true },
    { part: 'book', d: 'M232 382h154a8 8 0 0 1 8 8v80a8 8 0 0 1-8 8h-154a8 8 0 0 1-8-8v-80a8 8 0 0 1 8-8Z', fill: 'signal', stroke: 'ink', width: 9, round: true },
    { part: 'book', d: 'M246 384v92', stroke: 'ink', width: 7, round: true },
  ]
  const shutEyes: PipShape = { part: 'eyes', d: 'M238 298q24-28 48 0M353 298q24-28 48 0', stroke: 'ink', width: 11, round: true }
  const out: PipShape[] = []
  for (const s of PIP_FULL) {
    if (s.part === 'shineL' || s.part === 'shineR') continue
    if (s.part === 'eyes') {
      if (!out.includes(shutEyes)) out.push(shutEyes)
      continue
    }
    if (s.part === 'book') {
      if (!out.includes(closedBook[0])) out.push(...closedBook)
      continue
    }
    out.push(s)
  }
  return out
})()

/** Pip's shapes for a variant, dressed for the season: the hat in place of the tuft. */
export function pipShapes(variant: 'full' | 'head' | 'done', season?: keyof typeof PIP_HATS): PipShape[] {
  const base = variant === 'head' ? PIP_HEAD : variant === 'done' ? PIP_DONE : PIP_FULL
  return season ? [...base.filter((s) => s.part !== 'tuft'), ...PIP_HATS[season]] : base
}

export const PIP_VIEWBOX = { full: [0, 0, 640, 640], done: [0, 0, 640, 640], head: [130, 65, 380, 380] } as const
/** Where the owl actually is inside the full viewBox: what text should flow around. */
export const PIP_BOUNDS = { x: 135, y: 75, w: 370, h: 470 }
export const PIP_HEAD_BOUNDS = { x: 140, y: 74, w: 360, h: 345 }

export const PIP_ROLES: PipRole[] = ['ink', 'paper', 'oat', 'shade', 'line', 'signal', 'tint', 'blush', 'shine']
export type PipColors = Record<PipRole, string>

/** The current theme's Pip colours, for canvas drawing. */
export function pipColors(): PipColors {
  const cs = getComputedStyle(document.documentElement)
  return Object.fromEntries(PIP_ROLES.map((r) => [r, cs.getPropertyValue(`--pip-${r}`).trim() || '#888'])) as PipColors
}

export interface PipPose {
  /** -1 facing left, 1 facing right (Pip is symmetric but for the tuft). */
  facing?: number
  /** Body raised by this many viewBox units (a hop or a step). */
  lift?: number
  /** Which foot is up: 0 none, 1 left, 2 right. */
  step?: 0 | 1 | 2
  /** Wing angle in degrees, out from the body. */
  flap?: number
  /** 0 open to 1 shut. */
  blink?: number
  /** Where the eye shine sits, in viewBox units from rest: where Pip's looking. */
  look?: [number, number]
  /** Tuft tilt in degrees. */
  tuft?: number
  /** Draw every part in one colour, eyes and face cut out in `knockout`: the bouncing logo. */
  mono?: { colour: string; knockout: string }
}

const paths = new Map<string, Path2D>()
const pathFor = (d: string) => {
  let p = paths.get(d)
  if (!p) paths.set(d, (p = new Path2D(d)))
  return p
}

const PIVOT: Partial<Record<PipPart, [number, number]>> = { wingL: [200, 362], wingR: [440, 362], tuft: [352, 166], eyes: [319, 289] }

/**
 * Draws Pip at (x, y) with each viewBox unit `scale` CSS pixels, `shapes` being PIP_FULL or PIP_HEAD
 * and `box` its viewBox origin.
 */
export function drawPip(ctx: CanvasRenderingContext2D, shapes: PipShape[], box: readonly number[], x: number, y: number, scale: number, colors: PipColors, pose: PipPose = {}) {
  const { facing = 1, lift = 0, step = 0, flap = 0, blink = 0, look = [0, 0], tuft = 0, mono } = pose
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale * (facing < 0 ? -1 : 1), scale)
  ctx.translate(facing < 0 ? -(box[0] + box[2]) : -box[0], -box[1])
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of shapes) {
    ctx.save()
    // Feet stay on the ground; everything else rises with a step.
    const grounded = s.part === 'footL' || s.part === 'footR'
    const footUp = (s.part === 'footL' && step === 1) || (s.part === 'footR' && step === 2)
    ctx.translate(0, grounded ? (footUp ? -10 : 0) : -lift)
    const pivot = PIVOT[s.part]
    if (pivot && (s.part === 'wingL' || s.part === 'wingR' || s.part === 'tuft')) {
      const angle = ((s.part === 'wingL' ? flap : s.part === 'wingR' ? -flap : tuft) * Math.PI) / 180
      ctx.translate(pivot[0], pivot[1])
      ctx.rotate(angle)
      ctx.translate(-pivot[0], -pivot[1])
    }
    if (s.part === 'shineL' || s.part === 'shineR') ctx.translate(look[0], look[1])
    if ((s.part === 'eyes' || s.part === 'shineL' || s.part === 'shineR') && blink > 0) {
      ctx.translate(0, 289)
      ctx.scale(1, Math.max(0.08, 1 - blink))
      ctx.translate(0, -289)
    }
    if ((s.part === 'shineL' || s.part === 'shineR') && blink > 0.6) {
      ctx.restore()
      continue
    }
    // One colour: everything in it, with the face and the eye shine cut out; no cheeks, no lines.
    if (mono && s.part === 'cheeks') {
      ctx.restore()
      continue
    }
    const path = s.d ? pathFor(s.d) : undefined
    if (s.ellipse) {
      ctx.beginPath()
      ctx.ellipse(s.ellipse[0], s.ellipse[1], s.ellipse[2], s.ellipse[3], 0, 0, Math.PI * 2)
    }
    if (s.fill) {
      ctx.fillStyle = mono ? (s.fill === 'paper' || s.fill === 'shine' ? mono.knockout : mono.colour) : colors[s.fill]
      if (path) ctx.fill(path)
      else ctx.fill()
    } else if (s.paint) {
      ctx.fillStyle = mono ? mono.colour : s.paint
      if (path) ctx.fill(path)
      else ctx.fill()
    }
    if (s.stroke && !mono) {
      ctx.strokeStyle = colors[s.stroke]
      ctx.lineWidth = s.width ?? 8
      if (path) ctx.stroke(path)
      else ctx.stroke()
    }
    ctx.restore()
  }
  ctx.restore()
}
