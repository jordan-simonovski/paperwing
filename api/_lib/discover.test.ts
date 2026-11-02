import { describe, expect, it } from 'vitest'
import { commonFeeds, feedLinks, knownFeeds, looksLikeFeed } from './discover'

describe('feed discovery', () => {
  it('reads the feeds a page names, resolved, without comment feeds', () => {
    const html = `<head>
      <link rel="alternate" type="application/rss+xml" title="Posts" href="/feed.xml">
      <link type='application/atom+xml' rel='alternate home' href='https://example.com/atom.xml?a=1&amp;b=2'>
      <link rel="alternate" type="application/rss+xml" title="Comments Feed" href="/comments/feed/">
      <link rel="alternate" hreflang="fr" href="/fr/">
      <link rel="stylesheet" href="/feed.css">
    </head>`
    expect(feedLinks(html, 'https://example.com/2026/10/post')).toEqual(['https://example.com/feed.xml', 'https://example.com/atom.xml?a=1&b=2'])
  })

  it('knows where hosted platforms keep feeds', () => {
    expect(knownFeeds(new URL('https://someone.substack.com/p/a-post'))).toEqual(['https://someone.substack.com/feed'])
    expect(knownFeeds(new URL('https://medium.com/@writer/a-post-123'))).toEqual(['https://medium.com/feed/@writer'])
    expect(knownFeeds(new URL('https://github.com/tailscale/tailscale'))).toEqual(['https://github.com/tailscale/tailscale/releases.atom'])
    expect(knownFeeds(new URL('https://example.com/'))).toEqual([])
  })

  it('guesses under the blog folder as well as the root', () => {
    const guesses = commonFeeds(new URL('https://rachelbythebay.com/w/2026/10/30/post/'))
    expect(guesses).toContain('https://rachelbythebay.com/w/atom.xml')
    expect(guesses).toContain('https://rachelbythebay.com/feed')
    expect(commonFeeds(new URL('https://example.com/post.html'))).not.toContain('https://example.com/post.html/feed')
  })

  it('tells a feed from a web page', () => {
    expect(looksLikeFeed('<?xml version="1.0"?>\n<?xml-stylesheet href="/s.xsl"?><rss version="2.0">')).toBe(true)
    expect(looksLikeFeed('<feed xmlns="http://www.w3.org/2005/Atom">')).toBe(true)
    expect(looksLikeFeed('<!doctype html><html>')).toBe(false)
  })
})
