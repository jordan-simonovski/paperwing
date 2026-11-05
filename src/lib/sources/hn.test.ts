import { afterEach, describe, expect, it, vi } from 'vitest'
import { hnByUrl, hnList, hnSearch } from './hn'

const hit = { objectID: '1', title: 'A story', url: 'https://example.com/a', author: 'pg', points: 10, num_comments: 2, created_at_i: 1_700_000_000 }

describe('Hacker News requests to Algolia', () => {
  afterEach(() => vi.unstubAllGlobals())

  // Algolia sends its answers uncompressed, and a highlight of every matched word is half of each one.
  it('ask for no highlights: nothing shows them', async () => {
    const asked: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url)
      const body = url.includes('firebaseio') ? [1] : { hits: [hit] }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    await hnList('top')
    await hnList('new')
    await hnSearch('rust', { anyWord: true })
    await hnByUrl('https://example.com/a')
    const algolia = asked.filter((u) => u.includes('algolia'))
    expect(algolia).toHaveLength(4)
    for (const u of algolia) expect(new URL(u).searchParams.get('attributesToHighlight')).toBe('[]')
  })
})
