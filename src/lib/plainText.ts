// Apart from html.ts so the feed row's excerpt doesn't bring DOMPurify (sanitize) into the app's first load.

// Rows ask for this on every render, and parsing builds a whole document each time.
const texts = new Map<string, string>()

export function plainText(html: string): string {
  let text = texts.get(html)
  if (text === undefined) {
    // Most excerpts are already plain text: no tags or entities, nothing to parse.
    text = /[<&]/.test(html) ? (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '') : html
    text = text.replace(/\s+/g, ' ').trim()
    if (texts.size > 3000) texts.clear()
    texts.set(html, text)
  }
  return text
}
