import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import type { Article } from '../src/lib/types.js'
import { assertPublicUrl, fail, fetchText, json } from './_lib/http.js'

function absolutize(html: string, base: string): string {
  const { document } = parseHTML(`<!doctype html><html><body><div id="root">${html}</div></body></html>`)
  const fix = (el: Element, attr: string) => {
    const v = el.getAttribute(attr)
    if (!v || v.startsWith('data:') || v.startsWith('#')) return
    try {
      el.setAttribute(attr, new URL(v, base).toString())
    } catch {
      el.removeAttribute(attr)
    }
  }
  document.querySelectorAll('a[href]').forEach((el: Element) => fix(el, 'href'))
  document.querySelectorAll('img').forEach((el: Element) => {
    const lazy = el.getAttribute('data-src') || el.getAttribute('data-original')
    if (lazy && !el.getAttribute('src')) el.setAttribute('src', lazy)
    fix(el, 'src')
    el.removeAttribute('srcset')
    el.setAttribute('loading', 'lazy')
  })
  document.querySelectorAll('source, picture source').forEach((el: Element) => el.remove())
  // Metering and sign-up nags that Readability keeps because they sit inside the article body.
  const NAG =
    /(articles? left to read|before you need to register|register (for )?a free|create a free account|subscribe to (continue|keep) reading|sign up to (continue|keep) reading|already a (member|subscriber)\??\s*(log|sign) in)/i
  document.querySelectorAll('p, div, aside, section').forEach((el: Element) => {
    const text = el.textContent ?? ''
    if (text.length < 240 && NAG.test(text)) el.remove()
  })
  return document.getElementById('root')?.innerHTML ?? html
}

/** arXiv abstract pages only carry the abstract; the HTML rendering has the full paper. */
function preferredUrl(url: URL): string[] {
  const m = url.hostname.endsWith('arxiv.org') && url.pathname.match(/^\/(abs|pdf)\/([\w.]+?)(v\d+)?(\.pdf)?$/)
  if (m) return [`https://arxiv.org/html/${m[2]}`, `https://arxiv.org/abs/${m[2]}`]
  return [url.toString()]
}

async function extract(target: string): Promise<Article> {
  let lastError: unknown
  for (const candidate of preferredUrl(await assertPublicUrl(target))) {
    try {
      const { text, finalUrl, contentType } = await fetchText(candidate, { headers: { accept: 'text/html,application/xhtml+xml' }, timeoutMs: 12_000 })
      if (!contentType.includes('html')) throw new Error(`Not an HTML page (${contentType.split(';')[0] || 'unknown type'})`)
      await assertPublicUrl(finalUrl)
      const { document } = parseHTML(text)
      const parsed = new Readability(document as unknown as Document, { charThreshold: 300 }).parse()
      if (!parsed?.content) throw new Error('Could not find readable content')
      return {
        url: target,
        title: parsed.title || target,
        byline: parsed.byline ?? undefined,
        siteName: parsed.siteName ?? new URL(finalUrl).hostname,
        html: absolutize(parsed.content, finalUrl),
        excerpt: parsed.excerpt ?? undefined,
        length: parsed.length ?? undefined,
        publishedTime: parsed.publishedTime ?? undefined,
      }
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

export async function GET(request: Request): Promise<Response> {
  const target = new URL(request.url).searchParams.get('url')
  if (!target) return fail('url required')
  try {
    return json(await extract(target), 86_400)
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'extract failed', 422)
  }
}
