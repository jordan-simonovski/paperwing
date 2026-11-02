import type { Comment, Story, Thread } from '../types'
import { markup } from '../markup'
import { getJson } from './http'

const ALGOLIA = 'https://hn.algolia.com/api/v1'
const FIREBASE = 'https://hacker-news.firebaseio.com/v0'

interface Hit {
  objectID: string
  title: string
  url: string | null
  author: string
  points: number | null
  num_comments: number | null
  created_at_i: number
  story_text?: string | null
}

interface Item {
  id: number
  author: string | null
  title?: string
  url?: string | null
  text: string | null
  points: number | null
  created_at_i: number
  type: string
  children: Item[]
}

const discussion = (id: string | number) => `https://news.ycombinator.com/item?id=${id}`

function mapHit(h: Hit): Story {
  return {
    key: `hn-${h.objectID}`,
    source: 'hn',
    sourceLabel: 'Hacker News',
    title: h.title,
    url: h.url || null,
    discussionUrl: discussion(h.objectID),
    author: h.author,
    score: h.points ?? 0,
    comments: h.num_comments ?? 0,
    createdAt: h.created_at_i * 1000,
    text: h.story_text ? markup(h.story_text) : undefined,
    hasThread: true,
  }
}

/** HN's own ordering from Firebase, hydrated in one Algolia call via OR'd story_<id> tags. */
export async function hnList(list: 'top' | 'new' | 'best' | 'ask' | 'show'): Promise<Story[]> {
  if (list === 'new') {
    const data = await getJson<{ hits: Hit[] }>(`${ALGOLIA}/search_by_date?tags=story&hitsPerPage=60`)
    return data.hits.map(mapHit)
  }
  const ids = (await getJson<number[]>(`${FIREBASE}/${list}stories.json`)).slice(0, 90)
  const tags = `(${ids.map((id) => `story_${id}`).join(',')})`
  const data = await getJson<{ hits: Hit[] }>(`${ALGOLIA}/search?tags=${encodeURIComponent(tags)}&hitsPerPage=100`)
  const byId = new Map(data.hits.map((h) => [Number(h.objectID), h]))
  return ids.flatMap((id) => {
    const h = byId.get(id)
    return h ? [mapHit(h)] : []
  })
}

export interface SearchOptions {
  sort?: 'relevance' | 'date'
  /** Only stories newer than this many days. */
  days?: number
  minPoints?: number
  /** Treat every word as optional, i.e. OR them. */
  anyWord?: boolean
  limit?: number
}

export async function hnSearch(query: string, opts: SearchOptions = {}): Promise<Story[]> {
  const { sort = 'relevance', days, minPoints, anyWord, limit = 60 } = opts
  const filters: string[] = []
  if (days) filters.push(`created_at_i>${Math.floor(Date.now() / 1000 - days * 86_400)}`)
  if (minPoints) filters.push(`points>${minPoints}`)
  const params = new URLSearchParams({ query, tags: 'story', hitsPerPage: String(limit) })
  if (filters.length) params.set('numericFilters', filters.join(','))
  if (anyWord) params.set('optionalWords', query.replace(/"/g, ''))
  const data = await getJson<{ hits: Hit[] }>(`${ALGOLIA}/${sort === 'date' ? 'search_by_date' : 'search'}?${params}`)
  return data.hits.filter((h) => h.title).map(mapHit)
}

export async function hnByUrl(url: string): Promise<Story[]> {
  const bare = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  const params = new URLSearchParams({ query: bare, restrictSearchableAttributes: 'url', tags: 'story', hitsPerPage: '10' })
  const data = await getJson<{ hits: Hit[] }>(`${ALGOLIA}/search?${params}`)
  return data.hits.filter((h) => h.url && h.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') === bare).map(mapHit)
}

function mapComment(item: Item): Comment {
  return {
    id: String(item.id),
    author: item.author ?? '[deleted]',
    html: markup(item.text ?? ''),
    deleted: !item.author,
    createdAt: item.created_at_i * 1000,
    url: discussion(item.id),
    children: item.children.filter((c) => c.type === 'comment' && (c.author || c.children.length)).map(mapComment),
  }
}

export async function hnThread(id: string): Promise<Thread> {
  // Algolia has the whole tree in one call but not HN's ranking; Firebase's `kids` has the top-level order.
  const [item, ranked] = await Promise.all([getJson<Item>(`${ALGOLIA}/items/${id}`), getJson<{ kids?: number[] } | null>(`${FIREBASE}/item/${id}.json`).catch(() => null)])
  const order = new Map((ranked?.kids ?? []).map((k, i) => [String(k), i]))
  const comments = item.children
    .filter((c) => c.type === 'comment' && (c.author || c.children.length))
    .map(mapComment)
    .sort((a, b) => (order.get(a.id) ?? 1e6) - (order.get(b.id) ?? 1e6))
  const count = (cs: Comment[]): number => cs.reduce((n, c) => n + 1 + count(c.children), 0)
  return {
    story: {
      key: `hn-${item.id}`,
      source: 'hn',
      sourceLabel: 'Hacker News',
      title: item.title ?? '',
      url: item.url || null,
      discussionUrl: discussion(item.id),
      author: item.author ?? undefined,
      score: item.points ?? 0,
      comments: count(comments),
      createdAt: item.created_at_i * 1000,
      text: item.text ? markup(item.text) : undefined,
      hasThread: true,
    },
    comments,
  }
}
