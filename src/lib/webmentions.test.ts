import { describe, expect, it } from 'vitest'
import { toWebmentions } from './webmentions'

describe('webmentions', () => {
  it('keeps public replies, mentions and nods with web links only', () => {
    const list = toWebmentions({
      children: [
        {
          'wm-id': 1,
          'wm-property': 'in-reply-to',
          url: 'https://blog.example/reply',
          author: { name: 'Ann', photo: 'https://blog.example/me.jpg' },
          content: { text: '  Great   post ' },
          published: '2026-11-01T00:00:00Z',
        },
        { 'wm-id': 2, 'wm-property': 'like-of', url: 'https://other.example/like', author: {} },
        { 'wm-id': 3, 'wm-property': 'mention-of', url: 'javascript:alert(1)' },
        { 'wm-id': 4, 'wm-property': 'in-reply-to', url: 'https://secret.example', 'wm-private': true },
        { 'wm-id': 5, 'wm-property': 'rsvp', url: 'https://x.example' },
      ],
    })
    expect(list.map((m) => [m.id, m.kind, m.author, m.text])).toEqual([
      [1, 'reply', 'Ann', 'Great post'],
      [2, 'like', 'other.example', undefined],
    ])
  })

  it('keeps an author’s photo and link only when they are web links', () => {
    const [good, hostile] = toWebmentions({
      children: [
        { 'wm-id': 1, 'wm-property': 'in-reply-to', url: 'https://blog.example/reply', author: { name: 'Ann', photo: 'https://blog.example/me.jpg', url: 'https://blog.example/' } },
        { 'wm-id': 2, 'wm-property': 'in-reply-to', url: 'https://bad.example/reply', author: { name: 'Mallory', photo: 'javascript:alert(1)', url: 'ms-msdt:/id' } },
      ],
    })
    expect([good.photo, good.authorUrl]).toEqual(['https://blog.example/me.jpg', 'https://blog.example/'])
    expect([hostile.author, hostile.photo, hostile.authorUrl]).toEqual(['Mallory', undefined, undefined])
  })
})
