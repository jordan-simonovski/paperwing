import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { searchLoaded } from './search'
import type { Story } from './types'

const story = (key: string, title: string, ageDays = 0, url: string | null = null): Story => ({
  key,
  source: 'rss',
  sourceLabel: 'Some blog',
  title,
  url,
  discussionUrl: null,
  createdAt: Date.now() - ageDays * 86_400_000,
  hasThread: false,
})

describe('searching loaded feeds', () => {
  const qc = new QueryClient()
  qc.setQueryData(['feed', 'rss:a'], [story('a', 'Postgres 19 ships with async IO'), story('b', 'Rust in the kernel', 40)])
  qc.setQueryData(['feed', 'lobsters:hottest'], [story('a', 'Postgres 19 ships with async IO'), story('c', 'Why we left MongoDB', 0, 'https://example.com/postgres-migration')])
  qc.setQueryData(['article', 'x'], [story('d', 'Postgres article cache, not a feed')])

  it('needs every word, looks at titles and links, and lists each story once', () => {
    expect(searchLoaded(qc, 'postgres', undefined).map((s) => s.key)).toEqual(['a', 'c'])
    expect(searchLoaded(qc, 'postgres async', undefined).map((s) => s.key)).toEqual(['a'])
  })

  it('keeps to the time range', () => {
    expect(searchLoaded(qc, 'rust', 30)).toEqual([])
    expect(searchLoaded(qc, 'rust', undefined).map((s) => s.key)).toEqual(['b'])
  })
})
