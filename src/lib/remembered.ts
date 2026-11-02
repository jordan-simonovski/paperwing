/**
 * A server answer that doesn't change while the app runs (is sync on here? summaries? push?),
 * asked once and shared. A failure (offline at start, a server hiccup) answers with `fallback`
 * this time but isn't remembered, so the next ask tries again instead of the whole session
 * believing the feature is off.
 */
export function remembered<T>(load: () => Promise<T>, fallback: T): (fresh?: boolean) => Promise<T> {
  let answer: Promise<T> | undefined
  return (fresh = false) => {
    if (fresh) answer = undefined
    return (answer ??= load().catch(() => {
      answer = undefined
      return fallback
    }))
  }
}

/** A JSON answer from our own server, failing (so it's asked again) on anything but a 2xx. */
export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return (await res.json()) as T
}
