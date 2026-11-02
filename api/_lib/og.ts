import { assertPublicUrl, decodeEntities, readLimited, safeFetch } from './http.js'
import { tagsIn, titleIn } from './text.js'

// The preview image a page declares for link cards, in order of preference.
const KEYS = ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']
const GENERIC = /(logo|favicon|icon|avatar|apple-touch|android-chrome|placeholder|default[-_]?(og|share|social)?)[^/]*$/i
const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? (m[1] ?? m[2] ?? m[3]).trim() : undefined
}

/** Reads just enough of the page to get past </head>; preview tags live there. */
async function readHead(url: string): Promise<{ html: string; finalUrl: string }> {
  const { res, finalUrl } = await safeFetch(url, { headers: { accept: 'text/html' }, timeoutMs: 6000 })
  if (!res.ok || !/html/i.test(res.headers.get('content-type') ?? '') || !res.body) {
    void res.body?.cancel().catch(() => {})
    throw new Error('Not a page')
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let html = ''
  while (html.length < 600_000) {
    const { done, value } = await reader.read()
    if (done) break
    html += decoder.decode(value, { stream: true })
    if (/<\/head>/i.test(html)) break
  }
  void reader.cancel().catch(() => {})
  return { html, finalUrl }
}

export async function ogImage(raw: string): Promise<string> {
  const url = await assertPublicUrl(raw)
  const { html, finalUrl } = await readHead(url.toString())
  const found = new Map<string, string>()
  for (const tag of tagsIn(html, 'meta')) {
    const key = (attr(tag, 'property') ?? attr(tag, 'name'))?.toLowerCase()
    const content = attr(tag, 'content')
    if (key && content && KEYS.includes(key) && !found.has(key)) found.set(key, content.replace(/&amp;/g, '&'))
  }
  for (const key of KEYS) {
    const value = found.get(key)
    if (!value) continue
    try {
      const image = new URL(value, finalUrl)
      if (image.protocol !== 'https:' && image.protocol !== 'http:') continue
      // A site-wide logo says nothing the source icon doesn't; no thumbnail beats a repeated logo.
      if (GENERIC.test(image.pathname)) continue
      return image.toString()
    } catch {
      /* bad URL, try the next tag */
    }
  }
  throw new Error('No preview image')
}

// Titles are often double-encoded (&amp;#8217;), so twice.
const decode = (s: string) => decodeEntities(decodeEntities(s))

/** A page's title for a link saved without one: its og:title, else its <title>. */
export async function pageTitle(raw: string): Promise<string | undefined> {
  const url = await assertPublicUrl(raw)
  const { html } = await readHead(url.toString())
  for (const tag of tagsIn(html, 'meta')) {
    const key = (attr(tag, 'property') ?? attr(tag, 'name'))?.toLowerCase()
    const content = attr(tag, 'content')
    if ((key === 'og:title' || key === 'twitter:title') && content) return decode(content).trim()
  }
  const title = titleIn(html)
  return title ? decode(title).replace(/\s+/g, ' ').trim() || undefined : undefined
}

const metaOf = (html: string) => {
  const found = new Map<string, string>()
  for (const tag of tagsIn(html, 'meta')) {
    const key = (attr(tag, 'property') ?? attr(tag, 'name'))?.toLowerCase()
    const content = attr(tag, 'content')
    if (key && content && !found.has(key))
      found.set(
        key,
        content
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;|&#x27;/g, "'"),
      )
  }
  return found
}

/** A link card for a page: its title and description, as its preview tags give them. */
export async function pageCard(raw: string): Promise<{ title?: string; description?: string }> {
  const url = await assertPublicUrl(raw)
  const { html } = await readHead(url.toString())
  const meta = metaOf(html)
  const title = meta.get('og:title') ?? meta.get('twitter:title') ?? titleIn(html)?.trim()
  const description = meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description')
  return { title: title?.slice(0, 300), description: description?.slice(0, 1000) }
}

/** A page's preview picture itself, small enough for a Bluesky link card (under 950 KB). */
export async function cardImage(raw: string): Promise<{ body: ArrayBuffer; type: string }> {
  const image = await ogImage(raw)
  const { res } = await safeFetch(image, { headers: { accept: 'image/avif,image/webp,image/png,image/jpeg' }, timeoutMs: 8000 })
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
  if (!res.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type)) {
    void res.body?.cancel().catch(() => {})
    throw new Error('No usable picture')
  }
  const bytes = await readLimited(res, 950_000).catch(() => {
    throw new Error('Picture too large for a link card')
  })
  return { body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, type }
}
