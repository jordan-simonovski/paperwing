import { describe, expect, it } from 'vitest'
import { toRss } from '../rss.js'

describe('RSS out', () => {
  it('writes a valid, escaped feed with links back to PaperWing', () => {
    const xml = toRss(
      {
        title: 'Science & <things>',
        description: 'd',
        page: 'https://paperwing.io/t/science',
        items: [
          {
            key: 'hn-1',
            source: 'hn',
            sourceLabel: 'Hacker News',
            title: 'A "quoted" <title>',
            url: 'https://example.com/a?b=1&c=2',
            discussionUrl: 'https://news.ycombinator.com/item?id=1',
            author: 'pg',
            createdAt: Date.UTC(2026, 10, 1),
            hasThread: true,
            note: 'Worth it',
          },
        ],
      },
      'https://paperwing.io/rss/topic/science',
    )
    expect(xml).toContain('<title>Science &amp; &lt;things&gt;</title>')
    expect(xml).toContain('<link>https://example.com/a?b=1&amp;c=2</link>')
    expect(xml).toContain('<atom:link href="https://paperwing.io/rss/topic/science" rel="self" type="application/rss+xml"/>')
    expect(xml).toContain('<pubDate>Sun, 01 Nov 2026 00:00:00 GMT</pubDate>')
    expect(xml).toContain('Worth it')
    expect(xml).toContain('https://paperwing.io/t/for-you/hn-1')
    expect(xml).not.toMatch(/<title>A "quoted" <title>/)
  })
})
