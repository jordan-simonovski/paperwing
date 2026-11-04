export type PullPhase = 'idle' | 'pulling' | 'armed' | 'refreshing'
export const PULL_THRESHOLD = 88

/** One downward gesture, followed by one refresh. Drag updates stay outside React. */
export function createPullToRefresh(refresh: () => Promise<unknown>, render: (phase: PullPhase, distance: number) => void) {
  let origin: { x: number; y: number } | undefined
  let distance = 0
  let busy = false
  let disposed = false
  const cancel = () => {
    origin = undefined
    distance = 0
    if (!busy && !disposed) render('idle', 0)
  }
  return {
    start(x: number, y: number) {
      if (busy || disposed) return
      origin = { x, y }
      distance = 0
    },
    move(x: number, y: number) {
      if (!origin || busy || disposed) return false
      const dy = y - origin.y
      const dx = Math.abs(x - origin.x)
      if (dy < -8 || (dx > 8 && dx > dy)) {
        cancel()
        return false
      }
      distance = Math.min(120, Math.max(0, dy * 0.55))
      render(distance >= PULL_THRESHOLD ? 'armed' : 'pulling', distance)
      return dy > 8
    },
    async end() {
      if (!origin || busy || disposed) return
      origin = undefined
      if (distance < PULL_THRESHOLD) return cancel()
      busy = true
      render('refreshing', 104)
      try {
        await refresh()
      } catch {
        // The feed owns error and retry UI; a failed request still releases the gesture.
      } finally {
        busy = false
        cancel()
      }
    },
    cancel,
    dispose() {
      disposed = true
      origin = undefined
    },
  }
}
