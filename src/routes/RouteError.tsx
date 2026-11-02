import { isRouteErrorResponse, useRouteError } from 'react-router'

/** Replaces React Router's developer error page with something a reader can recover from. */
export function RouteError() {
  const err = useRouteError()
  const message = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : err instanceof Error ? err.message : String(err)
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-[1.875rem] font-bold tracking-[-0.02em]">PaperWing hit an error</h1>
        <p className="mt-3 break-words font-mono text-[0.8125rem] text-ink-3">{message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Reload
          </button>
          <a className="btn" href="/t/for-you">
            Back to For you
          </a>
        </div>
      </div>
    </div>
  )
}
