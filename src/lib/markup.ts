// The markdown people type into places that don't render it: Hacker News (which only knows
// *italics*, indented code and links) and Bluesky (plain text). A "> " line is a quote, "- " or
// "1. " lines are a list, `backticks` are code and **asterisks** are bold. Works on the HTML each
// source already produces, so links and code blocks pass through untouched. The result is
// sanitized like any other comment.

type Block = { kind: 'p' | 'quote' | 'ul' | 'ol'; lines: string[] } | { kind: 'raw'; html: string }

const QUOTE = /^\s*(?:&gt;|>)\s?/
const BULLET = /^\s*[-*•]\s+/
const NUMBERED = /^\s*\d{1,3}[.)]\s+/

/** `code`, **bold** and *italic* in text between tags. */
function inline(text: string): string {
  return text
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*(?=\S)([^*]+?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*(?=\S)([^*\n]*?\S)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
}

/** Inline markup on text only: tags (and what's inside <code> and <a>) are left alone. */
function inlineOutsideTags(html: string): string {
  let skip = 0
  return html.replace(/(<\/?(code|a|pre)\b[^>]*>)|(<[^>]+>)|([^<]+)/gi, (m, edge: string | undefined, _name, tag, text: string | undefined) => {
    if (edge) {
      skip += edge.startsWith('</') ? -1 : 1
      return m
    }
    if (tag) return m
    return skip > 0 || !text ? m : inline(text)
  })
}

export function markup(html: string): string {
  if (!html) return html
  const blocks: Block[] = []
  const push = (kind: 'p' | 'quote' | 'ul' | 'ol', line: string) => {
    const last = blocks[blocks.length - 1]
    if (last && last.kind === kind) last.lines.push(line)
    else blocks.push({ kind, lines: [line] })
  }
  // Paragraphs, whether closed (<p>…</p>) or HN-style (<p> between them).
  for (const para of html.split(/<\/?p\b[^>]*>/i)) {
    const seg = para.trim()
    if (!seg) continue
    if (/<pre\b/i.test(seg)) {
      blocks.push({ kind: 'raw', html: seg })
      continue
    }
    // A new paragraph starts a new text block; quotes and lists carry on across paragraphs (HN
    // gives each list item, and each quoted paragraph, a paragraph of its own).
    if (blocks[blocks.length - 1]?.kind === 'p') blocks.push({ kind: 'raw', html: '' })
    for (const line of seg.split(/<br\s*\/?>/i)) {
      if (QUOTE.test(line)) push('quote', line.replace(QUOTE, ''))
      else if (BULLET.test(line)) push('ul', line.replace(BULLET, ''))
      else if (NUMBERED.test(line)) push('ol', line.replace(NUMBERED, ''))
      else push('p', line)
    }
  }
  return blocks
    .map((b) => {
      if (b.kind === 'raw') return b.html
      const lines = b.lines.map(inlineOutsideTags)
      if (b.kind === 'p') return `<p>${lines.join('<br>')}</p>`
      if (b.kind === 'quote') return `<blockquote><p>${lines.join('<br>')}</p></blockquote>`
      return `<${b.kind}>${lines.map((l) => `<li>${l}</li>`).join('')}</${b.kind}>`
    })
    .join('')
}
