import { describe, expect, it } from 'vitest'
import { parseNewsSearch } from './sources.js'

const xml = `<?xml version="1.0" encoding="utf-8" ?><rss version="2.0" xmlns:News="https://www.bing.com/news/search?q=x&amp;format=rss"><channel><title>x</title>
<item><title>Artemis III update</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;aid=&amp;tid=1&amp;url=https%3a%2f%2fwww.usatoday.com%2fstory%2fspace%2fartemis%2f&amp;c=1&amp;mkt=en-us</link><description>NASA leaders discuss.</description><pubDate>Fri, 30 Oct 2026 10:35:00 GMT</pubDate><News:Source>USA Today on MSN</News:Source><News:Image>http://www.bing.com/th?id=ONUT.abc&amp;pid=News</News:Image></item>
<item><title>Bad link</title><link>javascript:alert(1)</link></item>
</channel></rss>`

describe('news search', () => {
  it('links straight to the publisher, under its own name', () => {
    const [s, ...rest] = parseNewsSearch(xml)
    expect(rest).toHaveLength(0)
    expect(s.url).toBe('https://www.usatoday.com/story/space/artemis/')
    expect(s.sourceLabel).toBe('USA Today')
    expect(s.site).toBe('usatoday.com')
    expect(s.thumbnail).toBe('https://www.bing.com/th?id=ONUT.abc&pid=News')
  })
})
