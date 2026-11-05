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
