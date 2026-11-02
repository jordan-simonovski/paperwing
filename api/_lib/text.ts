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
