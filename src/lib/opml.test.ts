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

  it('files a feed under the folder it’s nearest, and none once its folders close', () => {
    const { feeds } = parseOpml(`<opml><body>
      <outline text="Outer">
        <outline text="Inner"><outline text="A" xmlUrl="https://a.example/feed"/></outline>
        <outline><outline text="B" xmlUrl="https://b.example/feed"/></outline>
        <outline text="C" xmlUrl="https://c.example/feed"><outline text="D" xmlUrl="https://d.example/feed"/></outline>
      </outline>
      <outline text="E" xmlUrl="https://e.example/feed"/>
    </body></opml>`)
    expect(feeds.map((f) => [f.label, f.folder])).toEqual([
      ['A', 'Inner'],
      ['B', 'Outer'],
      ['C', 'Outer'],
      ['D', 'Outer'],
      ['E', undefined],
    ])
  })

  it('keeps out every kind of key in an address, and reads its own formats', () => {
    const outline = (url: string, extra = '') => `<outline text="x" ${extra} xmlUrl="${url}"/>`
    const { feeds, skipped } = parseOpml(
      `<opml><body>${[
        outline('https://a.example/rss?api_key=1'),
        outline('https://b.example/rss?sig=1&amp;page=2'),
        outline('https://c.example/rss?Passwd=1'),
        outline('https://g.example/rss?feed_token=1'),
        outline('https://h.example/rss?private-token=1'),
        outline('https://i.example/rss?X-Amz-Signature=1'),
        outline('https://j.example/rss?authToken=1'),
        outline('https://d.example/rss?page=2&amp;sort=new'),
        outline('https://e.example/journal', 'type="standard"'),
        outline('https://f.example/c/help/7.rss', 'type="rss" paperwingFormat="discourse"'),
      ].join('')}</body></opml>`,
    )
    expect(skipped.private).toBe(7)
    expect(feeds.map((f) => [f.url, f.format])).toEqual([
      ['https://d.example/rss?page=2&sort=new', undefined],
      ['https://e.example/journal', 'standard'],
      ['https://f.example/c/help/7.rss', 'discourse'],
    ])
  })

  it('shrugs off hostile files: a tag too long to be an outline, one never closed, and a huge file', () => {
    const long = `<outline text="${'x'.repeat(50_000)}" xmlUrl="https://long.example/feed"/>`
    const unclosed = '<outline text="Never closed" xmlUrl="https://open.example/feed"'
    const huge = '<outline text="F">'.repeat(20_000)
    const started = performance.now()
    const { feeds } = parseOpml(`<opml><body>${long}<outline text="ok" xmlUrl="https://ok.example/feed"/>${unclosed}${huge}</body></opml>`)
    // A long value is read and cut short, not left to run on.
    expect(feeds.map((f) => f.url)).toEqual(['https://long.example/feed', 'https://ok.example/feed'])
    expect(feeds[0].label).toHaveLength(120)
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('reads the type other readers give ordinary feeds, leaving out only the kinds it can’t', () => {
    const { feeds, skipped } = parseOpml(
      `<opml><body>${['rss', 'RSS', 'atom', 'rss2', 'link', 'xml'].map((t, n) => `<outline type="${t}" text="${t}" xmlUrl="https://f${n}.example/feed"/>`).join('')}
      <outline type="XML+XPath" text="x" xmlUrl="https://x.example/feed"/></body></opml>`,
    )
    expect(feeds).toHaveLength(6)
    expect(skipped.unreadable).toBe(1)
  })

  it('skips an address it can’t read without calling it private', () => {
    const { feeds, skipped } = parseOpml('<opml><body><outline text="x" xmlUrl="https://bad host.example/feed"/><outline text="ok" xmlUrl="https://ok.example/feed"/></body></opml>')
    expect(feeds.map((f) => f.label)).toEqual(['ok'])
    expect(skipped).toEqual({ unreadable: 0, private: 0 })
  })

  it('leaves the folder PaperWing’s own older exports put every feed in', () => {
    const { feeds } = parseOpml('<opml><body><outline text="Your feeds"><outline type="rss" text="A" xmlUrl="https://a.example/feed"/></outline></body></opml>')
    expect(feeds[0].folder).toBeUndefined()
  })
})
