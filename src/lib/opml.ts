// OPML: the file every feed reader uses to move subscriptions between apps. Importing one brings
// your feeds into PaperWing; exporting takes them, and the publishers behind your topics, anywhere
// else. Parsed with a small tolerant reader rather than an XML library: OPML in the wild is messy.

import type { PublisherFeed } from './publishers'
export type OpmlFeed = PublisherFeed

/** What an import left out, and why. */
export interface OpmlSkipped {
  /** Kinds of feed PaperWing can't read: FreshRSS's scraped pages (XPath) and JSON feeds. */
  unreadable: number
  /** Addresses holding a password or a token: kept out of PaperWing, where they'd be synced. */
  private: number
}

const ATTR = /([a-zA-Z:]+)\s*=\s*("([^"]*)"|'([^']*)')/g
// An outline tag, opening or closing. Quoted values may hold a '>' (an XPath in a FreshRSS export).
const TAG = /<outline\b(?:[^<>"']|"[^"]*"|'[^']*'){0,400}>|<\/outline\s*>/gi
/** The feed kinds PaperWing reads: unmarked, RSS or Atom, and its own Standard.site publications. */
const READABLE = new Set(['', 'rss', 'atom', 'standard'])
/** A query parameter that makes a feed address a key to someone's account. */
const SECRET = /^(token|access_?token|auth|key|api_?key|secret|password|passwd|sig|signature)$/i
/** The folder PaperWing's own exports used to put every followed feed in: no folder at all. */
const OLD_EXPORT_FOLDER = 'Your feeds'
const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const isPrivate = (u: URL) => !!(u.username || u.password) || [...u.searchParams.keys()].some((k) => SECRET.test(k))

/** Every feed in an OPML file (outlines with an xmlUrl), once each, web links only, each with its folder. */
export function parseOpml(text: string): { feeds: OpmlFeed[]; skipped: OpmlSkipped } {
  const feeds: OpmlFeed[] = []
  const skipped: OpmlSkipped = { unreadable: 0, private: 0 }
  const seen = new Set<string>()
  // The folders the reader is inside: a name for a folder, undefined for anything else left open.
  const open: (string | undefined)[] = []
  for (const [tag] of text.matchAll(TAG)) {
    if (tag[1] === '/') {
      open.pop()
      continue
    }
    const attrs: Record<string, string> = {}
    for (const m of tag.matchAll(ATTR)) attrs[m[1].toLowerCase()] = decode(m[3] ?? m[4] ?? '')
    const url = attrs.xmlurl?.trim()
    if (!/\/\s*>$/.test(tag)) open.push(url ? undefined : (attrs.title || attrs.text || '').trim().slice(0, 60) || undefined)
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) continue
    seen.add(url)
    if (!READABLE.has((attrs.type ?? '').trim().toLowerCase())) {
      skipped.unreadable++
      continue
    }
    let address: URL
    try {
      address = new URL(url)
    } catch {
      continue
    }
    if (isPrivate(address)) {
      skipped.private++
      continue
    }
    let site: string | undefined
    try {
      site = new URL(attrs.htmlurl || url).hostname.replace(/^www\./, '')
    } catch {
      /* no site */
    }
    const format = attrs.type === 'standard' ? 'standard' : attrs.paperwingformat === 'discourse' ? 'discourse' : undefined
    const folder = open.findLast((f) => f !== undefined)
    feeds.push({
      url,
      label: (attrs.title || attrs.text || site || url).trim().slice(0, 120),
      site,
      ...(format ? { format } : {}),
      ...(folder && folder !== OLD_EXPORT_FOLDER ? { folder } : {}),
    })
  }
  return { feeds, skipped }
}

/** An OPML file of feeds, in groups: a folder each in most readers, or loose for a group with no name. */
export function buildOpml(title: string, groups: { name: string; feeds: OpmlFeed[] }[]): string {
  const outline = (f: OpmlFeed, indent: string) =>
    `${indent}<outline type="${f.format === 'standard' ? 'standard' : 'rss'}"${f.format === 'discourse' ? ' paperwingFormat="discourse"' : ''} text="${esc(f.label)}" title="${esc(f.label)}" xmlUrl="${esc(f.url)}"${f.site ? ` htmlUrl="https://${esc(f.site)}"` : ''}/>`
  const body = groups
    .filter((g) => g.feeds.length)
    .map((g) =>
      g.name ? `    <outline text="${esc(g.name)}" title="${esc(g.name)}">\n${g.feeds.map((f) => outline(f, '      ')).join('\n')}\n    </outline>` : g.feeds.map((f) => outline(f, '    ')).join('\n'),
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${esc(title)}</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${body}
  </body>
</opml>
`
}
