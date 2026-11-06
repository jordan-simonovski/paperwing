// vercel.json's rewrites, applied as Vercel applies them, for the dev server: one list for both, so
// dev can't drift from production. Only rewrites that end at a function apply; the app's own
// fallback to index.html is Vite's job in dev.

interface Rewrite {
  source: string
  destination: string
  has?: { type: string; key: string; value?: string }[]
}

/** `/xrpc/:nsid` and `/rss/:path*` as a regular expression with named groups. */
const pattern = (source: string) =>
  new RegExp(
    `^${source
      .split('/')
      .map((seg) => (seg.startsWith(':') ? (seg.endsWith('*') ? `(?<${seg.slice(1, -1)}>.*)` : `(?<${seg.slice(1)}>[^/]+)`) : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('/')}$`,
  )

/** Where a request for `url` really goes, or undefined when no rewrite applies. `header` reads a request header by lower-case name. */
export function rewrite(url: string, header: (name: string) => string | undefined, rules: Rewrite[]): string | undefined {
  const u = new URL(url, 'http://localhost')
  for (const r of rules) {
    if (!r.destination.startsWith('/api/')) continue
    const m = pattern(r.source).exec(u.pathname)
    if (!m) continue
    if (r.has?.some((h) => h.type !== 'header' || (h.value === undefined ? header(h.key.toLowerCase()) === undefined : !new RegExp(`^(?:${h.value})$`).test(header(h.key.toLowerCase()) ?? ''))))
      continue
    const dest = new URL(
      r.destination.replace(/:(\w+)\*?/g, (_, k: string) => m.groups?.[k] ?? ''),
      'http://localhost',
    )
    for (const [k, v] of u.searchParams) if (!dest.searchParams.has(k)) dest.searchParams.append(k, v)
    return `${dest.pathname}${dest.search}`
  }
  return undefined
}
