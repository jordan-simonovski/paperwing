import { Component, type ReactNode } from 'react'
import { LoadFailed } from '../lib/retryableLazy'

/**
 * Around a part of the app that loads on demand (retryableLazy): if its code fails to arrive, it
 * fails on its own, with `onFail`, instead of replacing the whole page with the error screen. Any
 * other error is a bug, and goes on to the error screen as before.
 */
export class LoadBoundary extends Component<{ onFail: (error: LoadFailed) => void; children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: undefined }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown) {
    if (error instanceof LoadFailed) this.props.onFail(error)
  }

  render() {
    const { error } = this.state
    if (error === undefined) return this.props.children
    if (error instanceof LoadFailed) return null
    throw error
  }
}
