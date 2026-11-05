import { Component, type ReactNode } from 'react'

/**
 * Around a part of the app that loads on demand (React.lazy): if it fails to arrive, it fails on its
 * own, with `onFail`, instead of replacing the whole page with the error screen.
 */
export class LoadBoundary extends Component<{ onFail: (error: unknown) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onFail(error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
