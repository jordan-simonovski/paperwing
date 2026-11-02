import { describe, expect, it } from 'vitest'
import { fakeUpstreams } from '../_test/harness.js'
import { pageTitle } from './og.js'

const net = fakeUpstreams()
const page = (head: string) =>
  net
    .get('https://example.com')
    .intercept({ path: '/post' })
    .reply(200, `<!doctype html><html><head>${head}</head><body></body></html>`, { headers: { 'content-type': 'text/html' } })

describe('a page title for a saved link', () => {
  it('decodes every kind of entity, including characters outside the basic plane', async () => {
    page('<meta property="og:title" content="Launch day &#128640; &#x2014; what&amp;#8217;s new">')
    expect(await pageTitle('https://example.com/post')).toBe('Launch day 🚀 — what’s new')
  })

  it('falls back to <title>', async () => {
    page('<title>  &quot;Bars&quot; &amp;\n pubs </title>')
    expect(await pageTitle('https://example.com/post')).toBe('"Bars" & pubs')
  })
})
