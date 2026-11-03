import { parseStoryKey, storyKey } from '../storyKey'
export class FetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      /* not json */
    }
    throw new FetchError(message, res.status)
  }
  return res.json() as Promise<T>
}

type Params = Record<string, string | number | undefined>

function query(params: Params): URLSearchParams {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v))
  return qs
}

export const api = (path: string, params: Params) => getJson<unknown>(`/api/${path}?${query(params)}`)

/**
 * Every source api/feed.ts answers. Its SOURCES table is typed by this, so the app can't ask for a
 * source the server doesn't have, and the server can't drop one the app still asks for.
 */
export type FeedSource =
  | 'lobsters'
  | 'rss'
  | 'card'
  | 'cardimage'
  | 'paperwing'
  | 'fpactivity'
  | 'board'
  | 'boardinfo'
  | 'boards'
  | 'notes'
  | 'person'
  | 'mix'
  | 'news'
  | 'discover'
  | 'atlinks'
  | 'frontpage'
  | 'arxiv'
  | 'hf'
  | 'icon'
  | 'og'
  | 'releases'
  | 'github'
  | 'status'
  | 'statuscheck'

/** The address of one of api/feed.ts's sources: for an <img>, or a fetch that reads its own errors. `src` stays first (the service worker reads it). */
export const feedUrl = (src: FeedSource, params: Params = {}) => `/api/feed?${query({ src, ...params })}`

/** One of api/feed.ts's sources, as JSON. */
export const feed = (src: FeedSource, params: Params = {}) => getJson<unknown>(feedUrl(src, params))

export const linkKey = (url: string): string => storyKey({ kind: 'ln', url })

export function urlFromLinkKey(key: string): string | undefined {
  const p = parseStoryKey(key)
  return p?.kind === 'ln' ? p.url : undefined
}
