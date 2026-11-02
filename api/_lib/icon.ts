import { assertPublicUrl, fetchText, readLimited, safeFetch } from './http.js'

const ICON_LINK = /<link\b[^<>]{0,2000}?\brel=["']?([^"'<>]{0,200}?\bicon\b[^"'<>]{0,200})["']?[^<>]{0,2000}>/gi
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}=["']?([^"'\\s>]+)`, 'i'))?.[1]

/** Best icon a site declares, preferring SVG, then the largest raster, then /favicon.ico. */
async function candidates(home: URL): Promise<URL[]> {
  const out: { url: URL; score: number }[] = []
  try {
    const { text, finalUrl } = await fetchText(home.toString(), { headers: { accept: 'text/html' }, timeoutMs: 6000, maxBytes: 1_500_000 })
    for (const m of text.matchAll(ICON_LINK)) {
      const href = attr(m[0], 'href')
      if (!href) continue
      const type = attr(m[0], 'type') ?? ''
      const size = Number((attr(m[0], 'sizes') ?? '').split('x')[0]) || (/apple-touch/i.test(m[1]) ? 180 : 32)
      const svg = type.includes('svg') || /\.svg(\?|$)/i.test(href)
      // 32-192px rasters render crisply at 16-20px; huge ones waste bytes.
      const score = svg ? 1000 : size >= 32 && size <= 192 ? size : size > 192 ? 100 : size
      try {
        out.push({ url: new URL(href, finalUrl), score })
      } catch {
        /* bad href */
      }
    }
  } catch {
    /* homepage unreachable: fall through to /favicon.ico */
  }
  return [...out.sort((a, b) => b.score - a.score).map((c) => c.url), new URL('/favicon.ico', home)]
}

export async function favicon(domain: string): Promise<{ body: ArrayBuffer; type: string }> {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) throw new Error('Bad domain')
  const home = await assertPublicUrl(`https://${domain}/`)
  for (const url of (await candidates(home)).slice(0, 4)) {
    try {
      const { res } = await safeFetch(url.toString(), { headers: { accept: 'image/*' }, timeoutMs: 6000 })
      // An exact image type, and only one: "image/png, text/html" would render as a page.
      const header = res.headers.get('content-type') ?? ''
      const type = header.split(';')[0].trim().toLowerCase()
      if (!res.ok || header.includes(',') || !/^image\/(png|x-icon|vnd\.microsoft\.icon|svg\+xml|webp|jpeg|gif|avif)$/.test(type)) {
        void res.body?.cancel().catch(() => {})
        continue
      }
      const body = await readLimited(res, 300_000)
      if (body.byteLength > 0) return { body: body.buffer as ArrayBuffer, type }
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error('No icon')
}
