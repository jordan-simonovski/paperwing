import { lazy, type ComponentType } from 'react'

/** A part of the app whose code didn't arrive. Only this, not a bug while rendering, is LoadBoundary's to catch. */
export class LoadFailed extends Error {
  constructor(cause: unknown) {
    super('This part of the app didn’t load', { cause })
    this.name = 'LoadFailed'
  }
}

/**
 * React.lazy, but able to start over: React.lazy keeps a failed load for good, so after one, `retry`
 * makes a fresh component whose next render loads again. A failed load arrives as LoadFailed.
 */
export function retryableLazy<P extends object>(load: () => Promise<ComponentType<P>>) {
  const make = () =>
    lazy(() =>
      load().then(
        (Component) => ({ default: Component }),
        (e: unknown) => {
          throw new LoadFailed(e)
        },
      ),
    )
  let current = make()
  return {
    get Component() {
      return current
    },
    retry() {
      current = make()
    },
  }
}
