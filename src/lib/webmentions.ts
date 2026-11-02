import { keys } from './query'
import { useQuery } from '@tanstack/react-query'
import { webUrl } from './webUrl'

// Webmentions: how personal sites talk to each other. When a blog post links to an article and the
// article's site accepts webmentions (many IndieWeb sites do, through webmention.io), the reply,
// mention or like is recorded publicly. webmention.io's API is open to browsers, so this reads it
// straight from yours. Sites that don't take webmentions simply have none.

export interface Webmention {
  id: number
  kind: 'reply' | 'mention' | 'like' | 'repost' | 'bookmark'
  author: string
  photo?: string
  authorUrl?: string
  url: string
  text?: string
  at?: number
}

interface Jf2 {
  children?: {
    'wm-id': number
    'wm-property': string
    'wm-private'?: boolean
    url?: string
    'wm-source'?: string
    published?: string | null
    'wm-received'?: string
    author?: { name?: string; photo?: string; url?: string }
    content?: { text?: string }
    name?: string
  }[]
}

const KIND: Record<string, Webmention['kind']> = {
  'in-reply-to': 'reply',
  'mention-of': 'mention',
  'like-of': 'like',
  'repost-of': 'repost',
  'bookmark-of': 'bookmark',
}

export function toWebmentions(data: Jf2): Webmention[] {
  return (data.children ?? []).flatMap((c) => {
    const kind = KIND[c['wm-property']]
    const url = webUrl(c.url ?? c['wm-source'])
    if (!kind || !url || c['wm-private']) return []
    let host = url
    try {
      host = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      /* keep the url */
    }
    const text = (c.content?.text ?? c.name ?? '').replace(/\s+/g, ' ').trim()
    return [
      {
        id: c['wm-id'],
        kind,
        author: c.author?.name?.trim() || host,
        photo: webUrl(c.author?.photo),
        authorUrl: webUrl(c.author?.url),
        url,
        text: text ? (text.length > 280 ? `${text.slice(0, 279).replace(/\s+\S*$/, '')}…` : text) : undefined,
        at: Date.parse(c.published ?? c['wm-received'] ?? '') || undefined,
      },
    ]
  })
}

export function useWebmentions(url: string | null | undefined) {
  return useQuery({
    queryKey: keys.webmentions(url),
    enabled: !!webUrl(url),
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`https://webmention.io/api/mentions.jf2?per-page=60&sort-dir=down&target=${encodeURIComponent(url!)}`)
      if (!res.ok) return []
      return toWebmentions((await res.json()) as Jf2)
    },
  })
}
