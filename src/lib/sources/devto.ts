import type { Comment, Story, Thread } from '../types'
import { getJson } from './http'

interface Article {
  id: number
  title: string
  url: string
  comments_count: number
  public_reactions_count: number
  published_timestamp: string
  description: string
  cover_image?: string | null
  social_image?: string | null
  tag_list: string[] | string
  user: { username: string }
}
interface RawComment {
  id_code: string
  created_at: string
  body_html: string
  user: { username: string }
  children: RawComment[]
}

const BASE = 'https://dev.to/api'

// dev.to serves covers through a resizing CDN; ask for thumbnail size instead of 1000px.
const devtoThumb = (src?: string | null) => (src ? src.replace(/width=\d+,height=\d+,fit=\w+/, 'width=240,height=240,fit=cover') : undefined)

function map(a: Article, tag?: string): Story {
  return {
    key: `dv-${a.id}`,
    source: 'devto',
    sourceLabel: tag ? `dev.to #${tag}` : 'dev.to',
    title: a.title,
    url: a.url,
    discussionUrl: `${a.url}#comments`,
    author: a.user.username,
    score: a.public_reactions_count,
    comments: a.comments_count,
    createdAt: Date.parse(a.published_timestamp),
    text: a.description ? `<p>${a.description.replace(/</g, '&lt;')}</p>` : undefined,
    tags: Array.isArray(a.tag_list) ? a.tag_list : a.tag_list.split(/,\s*/),
    hasThread: true,
    thumbnail: devtoThumb(a.cover_image),
  }
}

export async function devtoTag(tag: string): Promise<Story[]> {
  const data = await getJson<Article[]>(`${BASE}/articles?tag=${encodeURIComponent(tag)}&top=7&per_page=30`)
  return data.map((a) => map(a, tag))
}

const mapComment = (c: RawComment): Comment => ({
  id: c.id_code,
  author: c.user.username,
  html: c.body_html,
  createdAt: Date.parse(c.created_at),
  children: c.children.map(mapComment),
})

export async function devtoThread(id: string): Promise<Thread> {
  const [article, comments] = await Promise.all([getJson<Article>(`${BASE}/articles/${id}`), getJson<RawComment[]>(`${BASE}/comments?a_id=${id}`)])
  return { story: map(article), comments: comments.map(mapComment) }
}
