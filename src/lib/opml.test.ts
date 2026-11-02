import { describe, expect, it } from 'vitest'
import { buildOpml, parseOpml } from './opml'

describe('OPML', () => {
  it('reads feeds from nested folders, once each, web links only', () => {
    const feeds = parseOpml(`<?xml version="1.0"?><opml version="1.0"><body>
      <outline text="Tech"><outline type="rss" text="Simon Willison" xmlUrl="https://simonwillison.net/atom/everything/" htmlUrl="https://simonwillison.net/"/>
      <outline title='Ars &amp; Co' xmlUrl='https://feeds.arstechnica.com/arstechnica/index'/></outline>
      <outline text="dupe" xmlUrl="https://simonwillison.net/atom/everything/"/>
      <outline text="bad" xmlUrl="javascript:alert(1)"/>
    </body></opml>`)
    expect(feeds).toEqual([
      { url: 'https://simonwillison.net/atom/everything/', label: 'Simon Willison', site: 'simonwillison.net' },
      { url: 'https://feeds.arstechnica.com/arstechnica/index', label: 'Ars & Co', site: 'feeds.arstechnica.com' },
    ])
  })
  it('round-trips what it writes', () => {
    const feeds = [{ url: 'https://example.com/feed?a=1&b=2', label: 'Example "quoted"', site: 'example.com' }]
    expect(parseOpml(buildOpml('Mine', [{ name: 'Blogs', feeds }]))).toEqual(feeds)
  })
})
