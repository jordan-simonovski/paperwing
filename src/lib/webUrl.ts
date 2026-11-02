/**
 * The address if it's an ordinary web link (http or https), else undefined. Links in posts come from
 * anyone: a `javascript:`, `file:` or app-protocol link (ms-msdt:, search-ms:) must never become
 * something to click or open.
 */
export function webUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' || u.protocol === 'http:' ? raw : undefined
  } catch {
    return undefined
  }
}
