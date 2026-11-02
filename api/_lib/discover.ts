import { assertPublicUrl, fetchText } from './http.js'
import { rss } from './sources.js'

// Finds a site's feeds from any link to it: the homepage, one of its posts, or the feed itself.
// Pages name their feeds in <link rel="alternate">; hosted platforms put them at known addresses;
// failing both, the usual paths are tried. Every candidate is fetched and parsed, so only real
// feeds with posts come back.

export interface FoundFeed {
  url: string
  title: string
  /** The publisher's host, for its logo and to tell whether it's already followed. */
  site: string
  posts: number
  latest?: number
}

const ATTR = (tag: string, name: string) =>
  tag
    .match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
    ?.slice(1)
    .find((v) => v !== undefined)
const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/g, '"')

/** The RSS and Atom feeds a page names in its <link rel="alternate"> tags, comment feeds left out. */
export function feedLinks(html: string, base: string): string[] {
  const out: string[] = []
  for (const [tag] of html.slice(0, 400_000).matchAll(/<link\b[^>]*>/gi)) {
    const rel = (ATTR(tag, 'rel') ?? '').toLowerCase().split(/\s+/)
    const type = (ATTR(tag, 'type') ?? '').toLowerCase()
    const href = ATTR(tag, 'href')
    if (!rel.includes('alternate') || !/(rss|atom)\+xml/.test(type) || !href) continue
    const title = ATTR(tag, 'title') ?? ''
    if (/comments?\b/i.test(title) || /\/comments\/feed|\/comments\.(rss|xml|atom)/i.test(href)) continue
    try {
      out.push(new URL(decode(href), base).toString())
    } catch {
      /* not a URL */
    }
  }
  return [...new Set(out)]
}

export const looksLikeFeed = (text: string) => /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*|<\?xml-stylesheet[^>]*>\s*)*<(rss|feed|rdf:RDF)\b/i.test(text.slice(0, 4000))

/** Hosted platforms keep each writer's feed at a known address. */
export function knownFeeds(u: URL): string[] {
  const host = u.hostname.replace(/^www\./, '')
  const [first, second] = u.pathname.split('/').filter(Boolean)
  if (host.endsWith('.substack.com')) return [`${u.origin}/feed`]
  if (host === 'medium.com' && first?.startsWith('@')) return [`https://medium.com/feed/${first}`]
  if (host.endsWith('.medium.com')) return [`${u.origin}/feed`]
  if (host.endsWith('.blogspot.com')) return [`${u.origin}/feeds/posts/default`]
  if (host === 'dev.to' && first) return [`https://dev.to/feed/${first}`]
  if (host === 'github.com' && first && second) return [`https://github.com/${first}/${second}/releases.atom`]
  if (host === 'github.com' && first) return [`https://github.com/${first}.atom`]
  return []
}

const COMMON = ['feed', 'rss.xml', 'atom.xml', 'index.xml', 'feed.xml', 'rss']

/** The usual feed addresses, at the site's root and under the folder the link points into (/w/atom.xml, /blog/feed). */
export function commonFeeds(u: URL): string[] {
  const folder = u.pathname.split('/').filter(Boolean)[0]
  const roots = folder && !folder.includes('.') ? ['/', `/${folder}/`] : ['/']
  return roots.flatMap((root) => COMMON.map((p) => new URL(root + p, u.origin).toString()))
}

async function page(url: string) {
  return fetchText(url, { headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5' }, maxBytes: 2_000_000, timeoutMs: 8000 }).catch(() => undefined)
}

async function check(url: string, guessed: boolean): Promise<FoundFeed | undefined> {
  // A guessed address is usually a 404 page: look before parsing, and don't wait long.
  if (guessed) {
    const probe = await fetchText(url, { headers: { accept: 'application/rss+xml, application/atom+xml, application/xml' }, maxBytes: 300_000, timeoutMs: 5000 }).catch(() => undefined)
    if (!probe || !looksLikeFeed(probe.text)) return undefined
  }
  const stories = await rss(url).catch(() => [])
  if (!stories.length) return undefined
  return {
    url,
    title: stories[0].sourceLabel,
    site: stories[0].site ?? new URL(url).hostname.replace(/^www\./, ''),
    posts: stories.length,
    latest: Math.max(...stories.map((s) => s.createdAt).filter(Number.isFinite)) || undefined,
  }
}

export async function discoverFeeds(raw: string): Promise<FoundFeed[]> {
  const url = await assertPublicUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  const candidates = new Set(knownFeeds(url))
  const first = await page(url.toString())
  if (first && looksLikeFeed(first.text)) candidates.add(first.finalUrl)
  else if (first) for (const f of feedLinks(first.text, first.finalUrl)) candidates.add(f)
  // A post that doesn't name the feed: its homepage usually does.
  if (!candidates.size && url.pathname !== '/') {
    const home = await page(url.origin)
    if (home) for (const f of feedLinks(home.text, home.finalUrl)) candidates.add(f)
  }
  const guessed = !candidates.size
  if (guessed) for (const f of commonFeeds(url)) candidates.add(f)
  const found = (await Promise.all([...candidates].slice(0, 12).map((c) => check(c, guessed)))).filter((f): f is FoundFeed => !!f)
  // Nothing found and the site never answered: say so, rather than that it has no feed. Some sites
  // refuse cloud servers outright.
  if (!found.length && !first) throw new Error(`Couldn't reach ${url.hostname}. Some sites refuse connections from servers like PaperWing's.`)
  // The same feed at two addresses (/feed and /feed/) shows once.
  const seen = new Set<string>()
  return found.filter((f) => {
    const id = `${f.title}|${f.site}|${f.posts}`
    return !seen.has(id) && !!seen.add(id)
  })
}
