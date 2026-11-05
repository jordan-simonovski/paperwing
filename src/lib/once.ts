/**
 * A load run once and shared by every caller, unless it fails: a failed load (a code chunk that
 * didn't arrive over a dropped connection, or one a deploy renamed) is forgotten, so the next call
 * tries again instead of failing for the rest of the session.
 */
export function once<T>(load: () => Promise<T>): () => Promise<T> {
  let loading: Promise<T> | undefined
  return () =>
    (loading ??= load().catch((e: unknown) => {
      loading = undefined
      throw e
    }))
}
