import { describe, expect, it } from 'vitest'
import { format, markdownHtml, markdownText, type Edit } from './markdown'

/** The text with the selection marked as [ and ], for readable expectations. */
const show = (e: Edit) => e.value.slice(0, e.start) + '[' + e.value.slice(e.start, e.end) + ']' + e.value.slice(e.end)
/** An edit from text with the selection marked as [ and ]. */
const at = (marked: string): Edit => {
  const start = marked.indexOf('[')
  const end = marked.indexOf(']') - 1
  return { value: marked.replace('[', '').replace(']', ''), start, end }
}

describe('a self post’s Markdown', () => {
  it('renders the way GitHub does: emphasis, lists, quotes, code and links', () => {
    const html = markdownHtml('# Hi\n\n**bold** and _italic_\n\n- one\n- two\n\n> said\n\n`x` and [a link](https://a.example)\n\n```\ncode\n```')
    expect(html).toContain('<h1>Hi</h1>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('<code>x</code>')
    expect(html).toContain('<a href="https://a.example">a link</a>')
    expect(html).toContain('<pre><code>code')
  })

  it('shows raw HTML as the text it is, never as markup', () => {
    const html = markdownHtml('<script>alert(1)</script> and <b>bold?</b>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;b&gt;')
  })

  it('turns pictures into links: a self post loads nothing from anywhere until it’s clicked', () => {
    const html = markdownHtml('![a cat](https://img.example/cat.png)')
    expect(html).not.toContain('<img')
    expect(html).toContain('<a href="https://img.example/cat.png">a cat</a>')
  })

  it('reads as plain text for the Bluesky post and previews', () => {
    expect(markdownText('# Title\n\nSome **bold** words, a [link](https://a.example) and `code`.\n\n- one\n- two')).toBe('Title Some bold words, a link and code. one two')
    expect(markdownText('![alt text](https://x.example/p.png)')).toBe('alt text')
  })
})

describe('the formatting toolbar', () => {
  it('wraps the selection, and unwraps it again', () => {
    expect(show(format(at('make [this] bold'), 'bold'))).toBe('make **[this]** bold')
    expect(show(format(format(at('make [this] bold'), 'bold'), 'bold'))).toBe('make [this] bold')
    expect(show(format(at('make [this] lean'), 'italic'))).toBe('make _[this]_ lean')
    expect(show(format(at('run [ls]'), 'code'))).toBe('run `[ls]`')
  })

  it('with nothing selected, leaves the cursor between the marks', () => {
    expect(show(format(at('say []'), 'bold'))).toBe('say **[]**')
  })

  it('makes a link of the selection, with the address selected to type over', () => {
    expect(show(format(at('see [the docs]'), 'link'))).toBe('see [the docs]([https://])')
  })

  it('makes every selected line a list item or a quote, and takes it back', () => {
    expect(show(format(at('[one\ntwo]'), 'list'))).toBe('[- one\n- two]')
    expect(show(format(format(at('[one\ntwo]'), 'list'), 'list'))).toBe('[one\ntwo]')
    expect(show(format(at('[one\ntwo]'), 'numbered'))).toBe('[1. one\n2. two]')
    expect(show(format(at('he said: [wow]'), 'quote'))).toBe('[> he said: wow]')
  })

  it('fences code across lines', () => {
    expect(show(format(at('[a\nb]'), 'code'))).toBe('```\n[a\nb]\n```')
  })
})
