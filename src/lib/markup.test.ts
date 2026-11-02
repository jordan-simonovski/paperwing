import { describe, expect, it } from 'vitest'
import { markup } from './markup'

describe('markup for plain-text comments', () => {
  it('turns HN quote paragraphs into a quote, and keeps the reply as text', () => {
    expect(markup('&gt; The rocket launch was only achieved through effort<p>Robots: they&#x27;re just like us!')).toBe(
      '<blockquote><p>The rocket launch was only achieved through effort</p></blockquote><p>Robots: they&#x27;re just like us!</p>',
    )
  })

  it('joins quoted paragraphs, and list items written one per paragraph', () => {
    expect(markup('&gt; one<p>&gt; two<p>- a<p>- b<p>after')).toBe('<blockquote><p>one<br>two</p></blockquote><ul><li>a</li><li>b</li></ul><p>after</p>')
    expect(markup('<p>Steps:<br>1. first<br>2. second</p>')).toBe('<p>Steps:</p><ol><li>first</li><li>second</li></ol>')
  })

  it('keeps separate paragraphs separate', () => {
    expect(markup('first<p>second')).toBe('<p>first</p><p>second</p>')
  })

  it('styles code, bold and italic in text, never inside links or code blocks', () => {
    expect(markup('use `git rebase` and **never** force push, *really*')).toBe('<p>use <code>git rebase</code> and <strong>never</strong> force push, <em>really</em></p>')
    expect(markup('<a href="https://x.dev/a*b*c">x.dev/`a`</a> 2*3*4')).toBe('<p><a href="https://x.dev/a*b*c">x.dev/`a`</a> 2*3*4</p>')
    expect(markup('see<p><pre><code>  &gt; not a quote\n  `x`</code></pre>')).toBe('<p>see</p><pre><code>  &gt; not a quote\n  `x`</code></pre>')
  })
})
