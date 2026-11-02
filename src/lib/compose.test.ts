import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { linkFrom, send } from './compose'
import { keys } from './query'
import type { Comment, Thread } from './types'

vi.mock('./hnAccount', async (real) => ({ ...(await real<typeof import('./hnAccount')>()), hnComment: vi.fn(async () => {}) }))

describe('the link in what someone pastes', () => {
  it('takes a full link as it is', () => {
    expect(linkFrom('https://example.com/post?a=1')).toBe('https://example.com/post?a=1')
  })
  it('accepts an address typed without https://', () => {
    expect(linkFrom('  example.com/post ')).toBe('https://example.com/post')
  })
  it('finds the link in a shared snippet with a title before it', () => {
    expect(linkFrom('A great read https://blog.example/slow')).toBe('https://blog.example/slow')
  })
  it('refuses anything that isn’t a web link', () => {
    expect(linkFrom('')).toBeUndefined()
    expect(linkFrom('just some words')).toBeUndefined()
    expect(linkFrom('javascript:alert(1)')).toBeUndefined()
    expect(linkFrom('ftp://example.com/file')).toBeUndefined()
    expect(linkFrom('https://localhost/admin')).toBeUndefined()
  })
})

describe('a reply you post appears in the thread on screen', () => {
  const comment = (id: string, children: Comment[] = []): Comment => ({ id, author: 'someone', html: '<p>hi</p>', createdAt: 1, score: 1, children })
  const thread = () => {
    const qc = new QueryClient()
    // HN comments carry no atproto ref, as the HN source builds them.
    qc.setQueryData<Thread>(keys.thread('hn-1'), { comments: [comment('11', [comment('12')]), comment('13')] } as Thread)
    return qc
  }
  const ids = (cs: Comment[]): unknown[] => cs.map((c) => (c.children.length ? [c.author === 'someone' ? c.id : 'new', ids(c.children)] : c.author === 'someone' ? c.id : 'new'))

  it('a comment on the story goes at the top, not under the first comment', async () => {
    const qc = thread()
    await send(qc, { kind: 'hn-reply', threadKey: 'hn-1', parent: '1', story: true }, 'On the story itself')
    expect(ids(qc.getQueryData<Thread>(keys.thread('hn-1'))!.comments)).toEqual(['new', ['11', ['12']], '13'])
  })

  it('a reply goes under the comment it answers', async () => {
    const qc = thread()
    await send(qc, { kind: 'hn-reply', threadKey: 'hn-1', parent: '12', story: false }, 'Replying to 12')
    expect(ids(qc.getQueryData<Thread>(keys.thread('hn-1'))!.comments)).toEqual([['11', [['12', ['new']]]], '13'])
  })
})
