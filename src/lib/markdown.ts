import { Marked, type Token } from 'marked'

// A self post's words: Markdown, written the GitHub way (a Write tab with a formatting toolbar and a
// Preview tab, MarkdownEditor.tsx) and rendered here. Raw HTML shows as the text it is, and pictures
// become links, so a post loads nothing from anywhere on its own. The HTML still goes through
// sanitize() (html.ts) before it's shown, like everything else.

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html: ({ text }) => escape(text),
    image: ({ href, text }) => `<a href="${escape(href)}">${escape(text || href)}</a>`,
  },
})

/** A self post's body as HTML (not yet sanitized). */
export const markdownHtml = (body: string): string => md.parse(body, { async: false })

/** A self post's body as one line of plain text: the snippet in its Bluesky post, and previews. */
export function markdownText(body: string): string {
  const out: string[] = []
  const walk = (tokens: Token[], block: boolean) => {
    for (const t of tokens) {
      if ('items' in t && Array.isArray(t.items)) walk(t.items as Token[], true)
      else if ('tokens' in t && Array.isArray(t.tokens) && t.tokens.length) walk(t.tokens, false)
      else if (t.type === 'image' || 'text' in t) out.push((t as { text: string }).text)
      if (block) out.push(' ')
    }
  }
  walk(md.lexer(body), true)
  return out.join('').replace(/\s+/g, ' ').trim()
}

/* ---------------------------------------------------------------- the toolbar */

export type FormatAction = 'bold' | 'italic' | 'link' | 'list' | 'numbered' | 'quote' | 'code'
/** The text in the editor and what's selected in it. */
export interface Edit {
  value: string
  start: number
  end: number
}

const WRAPS: Partial<Record<FormatAction, string>> = { bold: '**', italic: '_', code: '`' }

/** Marks either side of the selection, or takes them away when they're already there. */
function wrap({ value, start, end }: Edit, mark: string): Edit {
  const before = value.slice(0, start)
  const after = value.slice(end)
  if (before.endsWith(mark) && after.startsWith(mark))
    return { value: before.slice(0, -mark.length) + value.slice(start, end) + after.slice(mark.length), start: start - mark.length, end: end - mark.length }
  return { value: before + mark + value.slice(start, end) + mark + after, start: start + mark.length, end: end + mark.length }
}

/** Every line the selection touches, with a prefix each (or without it, when they all have one). */
function lines({ value, start, end }: Edit, prefix: (i: number) => string, has: RegExp): Edit {
  const from = value.lastIndexOf('\n', start - 1) + 1
  const nl = value.indexOf('\n', end)
  const to = nl === -1 ? value.length : nl
  const picked = value.slice(from, to).split('\n')
  const next = picked.every((l) => has.test(l)) ? picked.map((l) => l.replace(has, '')) : picked.map((l, i) => prefix(i) + l)
  const text = next.join('\n')
  return { value: value.slice(0, from) + text + value.slice(to), start: from, end: from + text.length }
}

/** What a toolbar button does to the text and its selection. */
export function format(edit: Edit, action: FormatAction): Edit {
  const { value, start, end } = edit
  const picked = value.slice(start, end)
  if (action === 'code' && picked.includes('\n')) {
    const fence = '```\n'
    return { value: value.slice(0, start) + fence + picked + '\n```' + value.slice(end), start: start + fence.length, end: end + fence.length }
  }
  const mark = WRAPS[action]
  if (mark) return wrap(edit, mark)
  if (action === 'link') {
    const head = `${value.slice(0, start)}[${picked}](`
    return { value: `${head}https://)${value.slice(end)}`, start: head.length, end: head.length + 'https://'.length }
  }
  if (action === 'list') return lines(edit, () => '- ', /^- /)
  if (action === 'numbered') return lines(edit, (i) => `${i + 1}. `, /^\d+\. /)
  return lines(edit, () => '> ', /^> /)
}
