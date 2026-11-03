import { describe, expect, it } from 'vitest'
import { commonFeeds, discoverFeeds, discourseFeeds, feedLinks, knownFeeds, looksLikeFeed } from './discover'
import { fakeUpstreams } from '../_test/harness'

const net = fakeUpstreams()

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

  it('finds a Discourse category’s feed without falling back to the whole forum', async () => {
    net.get('https://forum.example').intercept({ path: '/c/help/7' }).reply(200, '<meta name="generator" content="Discourse 3.5">')
    net
      .get('https://forum.example')
      .intercept({ path: '/c/help/7.rss' })
      .reply(200, '<rss><channel><title>Forum — Help</title><item><title>A question</title><link>https://forum.example/t/a-question/12</link></item></channel></rss>')
    expect(await discoverFeeds('https://forum.example/c/help/7')).toMatchObject([{ url: 'https://forum.example/c/help/7.rss', title: 'Forum — Help', posts: 1 }])
  })

  it('still finds a site’s RSS feed when its Standard.site claim can’t be verified', async () => {
    const hint = 'at://did:plc:abcdefghijklmnopqrstuvwx/site.standard.publication/blog'
    net
      .get('https://blog.example')
      .intercept({ path: '/' })
      .reply(200, `<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"><link rel="site.standard.publication" href="${hint}"></head></html>`)
    net.get('https://plc.directory').intercept({ path: '/did:plc:abcdefghijklmnopqrstuvwx' }).reply(500, 'down')
    net
      .get('https://blog.example')
      .intercept({ path: '/feed.xml' })
      .reply(200, '<rss><channel><title>A blog</title><item><title>A post</title><link>https://blog.example/a-post</link></item></channel></rss>')
    expect(await discoverFeeds('https://blog.example/')).toMatchObject([{ url: 'https://blog.example/feed.xml', title: 'A blog', posts: 1 }])
  })

  it('offers chronological and weekly forum feeds, and preserves tag and top filters', () => {
    const html = '<meta content="Discourse 3.5" name="generator">'
    expect(discourseFeeds(html, 'https://forum.example/')).toEqual(['https://forum.example/latest.rss?order=created', 'https://forum.example/top.rss?period=weekly'])
    expect(discourseFeeds(html, 'https://forum.example/tag/rust/12')).toEqual(['https://forum.example/tag/rust/12.rss'])
    expect(discourseFeeds(html, 'https://forum.example/top?period=monthly')).toEqual(['https://forum.example/top.rss?period=monthly'])
    expect(discourseFeeds('<meta name="generator" content="WordPress">', 'https://blog.example')).toEqual([])
  })
})
