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

export const api = (path: string, params: Record<string, string | number | undefined>) => {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v))
  return getJson<unknown>(`/api/${path}?${qs}`)
}

export const linkKey = (url: string): string => storyKey({ kind: 'ln', url })

export function urlFromLinkKey(key: string): string | undefined {
  const p = parseStoryKey(key)
  return p?.kind === 'ln' ? p.url : undefined
}
