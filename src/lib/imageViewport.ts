interface Point {
  x: number
  y: number
}
interface Bounds {
  width: number
  height: number
  imageWidth: number
  imageHeight: number
}
export interface ImageView extends Point {
  scale: number
}
const fit: ImageView = { scale: 1, x: 0, y: 0 }
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const clamp = (n: number, max: number) => Math.max(-max, Math.min(max, n))

/** Image-only zoom and pan. A multi-pointer gesture can never turn into album navigation. */
export function createImageViewport(initial: Bounds) {
  let bounds = initial
  let view = { ...fit }
  const pointers = new Map<number, Point>()
  let origin = { ...fit }
  let anchor: Point = { x: 0, y: 0 }
  let span = 0
  let multiple = false
  let start: Point | undefined
  const bounded = (next: ImageView) => ({
    scale: next.scale,
    x: clamp(next.x, Math.max(0, (bounds.imageWidth * next.scale - bounds.width) / 2)),
    y: clamp(next.y, Math.max(0, (bounds.imageHeight * next.scale - bounds.height) / 2)),
  })
  const begin = () => {
    origin = { ...view }
    const [a, b] = [...pointers.values()]
    if (a) anchor = b ? midpoint(a, b) : a
    span = b ? distance(a, b) : 0
  }
  const zoomAt = (scale: number, from: Point, to = from) => {
    scale = Math.max(1, Math.min(4, scale))
    const ratio = scale / origin.scale
    view = bounded({ scale, x: to.x - bounds.width / 2 - (from.x - bounds.width / 2 - origin.x) * ratio, y: to.y - bounds.height / 2 - (from.y - bounds.height / 2 - origin.y) * ratio })
  }
  return {
    view: () => ({ ...view }),
    down(id: number, point: Point) {
      if (!pointers.size) {
        start = point
        multiple = false
      }
      pointers.set(id, point)
      if (pointers.size > 1) multiple = true
      begin()
    },
    move(id: number, point: Point) {
      if (!pointers.has(id)) return
      pointers.set(id, point)
      const [a, b] = [...pointers.values()]
      if (b && span > 0) zoomAt((origin.scale * distance(a, b)) / span, anchor, midpoint(a, b))
      else if (view.scale > 1) view = bounded({ ...origin, x: origin.x + point.x - anchor.x, y: origin.y + point.y - anchor.y })
    },
    up(id: number): -1 | 0 | 1 {
      const end = pointers.get(id)
      const swipe = end && start && pointers.size === 1 && !multiple && view.scale === 1
      const dx = end && start ? end.x - start.x : 0
      const dy = end && start ? end.y - start.y : 0
      pointers.delete(id)
      begin()
      return swipe && Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.4 ? (dx < 0 ? 1 : -1) : 0
    },
    cancel(id?: number) {
      if (id !== undefined && !pointers.has(id)) return
      pointers.clear()
      start = undefined
      multiple = false
    },
    zoom(scale: number) {
      begin()
      zoomAt(scale, { x: bounds.width / 2, y: bounds.height / 2 })
    },
    reset() {
      pointers.clear()
      start = undefined
      view = { ...fit }
    },
    resize(next: Bounds) {
      bounds = next
      view = bounded(view)
      begin()
    },
  }
}
