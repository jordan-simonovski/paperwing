// OPML: the file every feed reader uses to move subscriptions between apps. Importing one brings
// your feeds into PaperWing; exporting takes them, and the publishers behind your topics, anywhere
// else. Parsed with a small tolerant reader rather than an XML library: OPML in the wild is messy.

export interface OpmlFeed {
  url: string
  label: string
  site?: string
}

const ATTR = /([a-zA-Z:]+)\s*=\s*("([^"]*)"|'([^']*)')/g
const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Every feed in an OPML file (outlines with an xmlUrl), once each, web links only. */
export function parseOpml(text: string): OpmlFeed[] {
  const out: OpmlFeed[] = []
  const seen = new Set<string>()
  for (const [tag] of text.matchAll(/<outline\b[^<>]{0,4000}>/gi)) {
    const attrs: Record<string, string> = {}
    for (const m of tag.matchAll(ATTR)) attrs[m[1].toLowerCase()] = decode(m[3] ?? m[4] ?? '')
    const url = attrs.xmlurl?.trim()
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) continue
    seen.add(url)
    let site: string | undefined
    try {
      site = new URL(attrs.htmlurl || url).hostname.replace(/^www\./, '')
    } catch {
      /* no site */
    }
    out.push({ url, label: (attrs.title || attrs.text || site || url).trim().slice(0, 120), site })
  }
  return out
}

/** An OPML file of feeds, in groups (a folder each in most readers). */
export function buildOpml(title: string, groups: { name: string; feeds: OpmlFeed[] }[]): string {
  const outline = (f: OpmlFeed) => `      <outline type="rss" text="${esc(f.label)}" title="${esc(f.label)}" xmlUrl="${esc(f.url)}"${f.site ? ` htmlUrl="https://${esc(f.site)}"` : ''}/>`
  const body = groups
    .filter((g) => g.feeds.length)
    .map((g) => `    <outline text="${esc(g.name)}" title="${esc(g.name)}">\n${g.feeds.map(outline).join('\n')}\n    </outline>`)
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
