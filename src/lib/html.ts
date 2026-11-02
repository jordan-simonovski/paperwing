import DOMPurify from 'dompurify'

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  // Only whole web (or mail) addresses: a relative link in someone's post would land on one of
  // PaperWing's own pages (say /share?url=…, which saves to your queue), not where its author meant.
  if (node.tagName === 'A' && node.getAttribute('href') && !/^(https?:|mailto:|#)/i.test(node.getAttribute('href')!.trim())) node.removeAttribute('href')
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer nofollow')
  }
  if (node.tagName === 'IMG') {
    node.setAttribute('loading', 'lazy')
    node.setAttribute('decoding', 'async')
    node.setAttribute('referrerpolicy', 'no-referrer')
  }
})

export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    // Image maps are links DOMPurify allows but our hook doesn't open in a new tab: one could swap the
    // app for a look-alike page.
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed', 'svg', 'map', 'area'],
    FORBID_ATTR: ['style', 'class', 'id', 'width', 'height', 'usemap'],
  })
}

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
