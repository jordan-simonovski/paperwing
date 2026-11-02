export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, (now - ms) / 1000)
  if (s < 60) return 'now'
  const m = s / 60
  if (m < 60) return `${Math.floor(m)}m`
  const h = m / 60
  if (h < 24) return `${Math.floor(h)}h`
  const d = h / 24
  if (d < 7) return `${Math.floor(d)}d`
  if (d < 365) return `${Math.floor(d / 7)}w`
  return `${Math.floor(d / 365)}y`
}

// Building a formatter is the expensive part (toLocaleString builds one per call), and every row
// asks for one, so keep a single instance.
let dateFormat: Intl.DateTimeFormat | undefined

export function fullDate(ms: number): string {
  dateFormat ??= new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  return dateFormat.format(ms)
}

export function domainOf(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    // Path-scoped hosts where the owner matters more than the domain.
    if (['github.com', 'gitlab.com', 'codeberg.org', 'medium.com', 'substack.com'].includes(host)) {
      const owner = u.pathname.split('/')[1]
      return owner ? `${host}/${owner}` : host
    }
    return host
  } catch {
    return undefined
  }
}

export function compact(n: number | undefined): string {
  if (n === undefined) return ''
  if (n < 1000) return String(n)
  if (n < 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return Math.round(n / 1000) + 'k'
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`
}
