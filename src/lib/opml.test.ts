import { describe, expect, it } from 'vitest'
import { buildOpml, parseOpml } from './opml'

describe('OPML', () => {
  it('reads feeds from nested folders, once each, web links only', () => {
    const { feeds } = parseOpml(`<?xml version="1.0"?><opml version="1.0"><body>
      <outline text="Tech"><outline type="rss" text="Simon Willison" xmlUrl="https://simonwillison.net/atom/everything/" htmlUrl="https://simonwillison.net/"/>
      <outline title='Ars &amp; Co' xmlUrl='https://feeds.arstechnica.com/arstechnica/index'/></outline>
      <outline text="dupe" xmlUrl="https://simonwillison.net/atom/everything/"/>
      <outline text="bad" xmlUrl="javascript:alert(1)"/>
    </body></opml>`)
    expect(feeds).toEqual([
      { url: 'https://simonwillison.net/atom/everything/', label: 'Simon Willison', site: 'simonwillison.net', folder: 'Tech' },
      { url: 'https://feeds.arstechnica.com/arstechnica/index', label: 'Ars & Co', site: 'feeds.arstechnica.com', folder: 'Tech' },
    ])
  })

  it('round-trips what it writes, folders and all', () => {
    const feeds = [
      { url: 'https://example.com/feed?a=1&b=2', label: 'Example "quoted"', site: 'example.com' },
      { url: 'https://other.example/rss', label: 'Other', site: 'other.example', folder: 'Friends & family' },
    ]
    expect(
      parseOpml(
        buildOpml('Mine', [
          { name: '', feeds: [feeds[0]] },
          { name: 'Friends & family', feeds: [feeds[1]] },
        ]),
      ).feeds,
    ).toEqual(feeds)
  })

  it('takes a FreshRSS export: its folders, its own settings ignored, the kinds of feed it can’t read left out', () => {
    const { feeds, skipped } = parseOpml(`<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0" xmlns:frss="https://freshrss.org/opml">
  <head><title>FreshRSS</title></head>
  <body>
    <outline text="Engineering">
      <outline text="Julia Evans" type="rss" xmlUrl="https://jvns.ca/atom.xml" htmlUrl="https://jvns.ca/" description="" frss:cssFullContent="article &gt; div"/>
      <outline text="Scraped news" type="HTML+XPath" xmlUrl="https://news.example/latest" htmlUrl="https://news.example/" frss:xPathItem="//li[position()>1]"/>
      <outline text="A JSON feed" type="JSONFeed" xmlUrl="https://json.example/feed.json" htmlUrl="https://json.example/"/>
      <outline text="Dotted" type="JSON+DotNotation" xmlUrl="https://api.example/items" htmlUrl="https://api.example/"/>
    </outline>
    <outline text="Private">
      <outline text="Paid letter" type="rss" xmlUrl="https://letters.example/feed?token=s3cret" htmlUrl="https://letters.example/"/>
      <outline text="Intranet" type="rss" xmlUrl="https://me:hunter2@intranet.example/rss" htmlUrl="https://intranet.example/"/>
    </outline>
    <outline text="Loose" type="RSS" xmlUrl="https://loose.example/index.xml" htmlUrl="https://loose.example/"/>
  </body>
</opml>`)
    expect(feeds).toEqual([
      { url: 'https://jvns.ca/atom.xml', label: 'Julia Evans', site: 'jvns.ca', folder: 'Engineering' },
      { url: 'https://loose.example/index.xml', label: 'Loose', site: 'loose.example' },
    ])
    expect(skipped).toEqual({ unreadable: 3, private: 2 })
  })

  it('leaves the folder PaperWing’s own older exports put every feed in', () => {
    const { feeds } = parseOpml('<opml><body><outline text="Your feeds"><outline type="rss" text="A" xmlUrl="https://a.example/feed"/></outline></body></opml>')
    expect(feeds[0].folder).toBeUndefined()
  })
})
