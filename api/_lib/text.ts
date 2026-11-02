// Plain text into the small HTML the app renders (comments, incident updates, post bodies), and
// the bits of text handling every server module needs. Story HTML is sanitised again in the app;
// this keeps what we produce well-formed in the first place.

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A link's site name ("example.com"), or `fallback` when it isn't a URL. */
export function siteOf(url: string, fallback = ''): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return fallback
  }
}

/**
 * Plain text as paragraphs: blank lines split them, single newlines become line breaks and bare
 * links become clickable. Paragraphs are separated by a newline so excerpts, which read the text
 * alone, don't run words together.
 */
export function textHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p>${escapeHtml(p)
          .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]]/g, (u) => `<a href="${u}">${u}</a>`)
          .replace(/\n/g, '<br>')}</p>`,
    )
    .join('\n')
}

// Fetched pages are anyone's HTML. A tag's body is bounded and can't contain '<', so a page full of
// unclosed tags is read once rather than rescanned to the end from each one (a quadratic scan that
// freezes the function for about a minute on 500 KB of "<meta ").
const PAGE_LIMIT = 600_000

/** A page's `<name …>` tags, in order. */
export const tagsIn = (html: string, name: string): string[] => [...html.slice(0, PAGE_LIMIT).matchAll(new RegExp(`<${name}\\b[^<>]{0,4000}>`, 'gi'))].map((m) => m[0])

/** The text of a page's <title>, as written (entities and all). */
export const titleIn = (html: string): string | undefined => /<title\b[^<>]{0,400}>([^<]{0,2000})<\/title>/i.exec(html.slice(0, PAGE_LIMIT))?.[1]
