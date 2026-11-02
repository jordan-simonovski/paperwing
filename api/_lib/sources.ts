import { XMLParser } from 'fast-xml-parser'
import type { Comment, Story, Thread } from '../../src/lib/types.js'
import { assertPublicUrl, fetchJson, fetchText, linkKey, stripHtml } from './http.js'

const excerpt = (html: string | undefined, max = 320) => {
  if (!html) return undefined
  const plain = stripHtml(html)
  if (!plain) return undefined
  return plain.length > max ? plain.slice(0, max).replace(/\s+\S*$/, '') + '…' : plain
}
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const para = (s: string | undefined) => (s ? `<p>${escapeHtml(s)}</p>` : undefined)

/* ---------------------------------------------------------------- Lobsters */

interface LobstersStory {
  short_id: string
  created_at: string
  title: string
  url: string
  score: number
  comment_count: number
  description: string
  submitter_user: string | { username: string }
  tags: string[]
  comments_url: string
}
interface LobstersComment {
  short_id: string
  created_at: string
  is_deleted: boolean
  is_moderated: boolean
  score: number
  parent_comment: string | null
  comment: string
  commenting_user: string | { username: string }
  url: string
}
const username = (u: string | { username: string }) => (typeof u === 'string' ? u : u.username)

function mapLobsters(s: LobstersStory): Story {
  return {
    key: `lb-${s.short_id}`,
    source: 'lobsters',
    sourceLabel: 'Lobsters',
    title: s.title,
    url: s.url || null,
    discussionUrl: s.comments_url,
    author: username(s.submitter_user),
    score: s.score,
    comments: s.comment_count,
    createdAt: Date.parse(s.created_at),
    text: s.description || undefined,
    tags: s.tags,
    hasThread: true,
  }
}

export async function lobsters(path: string): Promise<Story[]> {
  if (!/^(hottest|newest|active|t\/[a-z0-9_,-]+)$/.test(path)) throw new Error('Bad lobsters path')
  const data = await fetchJson<LobstersStory[]>(`https://lobste.rs/${path}.json`)
  return data.map(mapLobsters)
}

export async function lobstersThread(id: string): Promise<Thread> {
  if (!/^[a-z0-9]+$/.test(id)) throw new Error('Bad lobsters id')
  const data = await fetchJson<LobstersStory & { comments: LobstersComment[] }>(`https://lobste.rs/s/${id}.json`)
  const byId = new Map<string, Comment>()
  const roots: Comment[] = []
  for (const c of data.comments) {
    const node: Comment = {
      id: c.short_id,
      author: username(c.commenting_user),
      html: c.is_deleted || c.is_moderated ? '' : c.comment,
      deleted: c.is_deleted || c.is_moderated,
      createdAt: Date.parse(c.created_at),
      score: c.score,
      url: c.url,
      children: [],
    }
    byId.set(c.short_id, node)
    const parent = c.parent_comment ? byId.get(c.parent_comment) : undefined
    ;(parent ? parent.children : roots).push(node)
  }
  return { story: mapLobsters(data), comments: roots }
}

/* --------------------------------------------------------------- RSS/Atom */

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', processEntities: true, htmlEntities: true })
type Node = Record<string, unknown>
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])
const txt = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  if (Array.isArray(v)) return txt(v[0])
  if (typeof v === 'object') return txt((v as Node)['#text'] ?? (v as Node)['name'] ?? '')
  return ''
}

export async function rss(rawUrl: string, label?: string): Promise<Story[]> {
  const url = await assertPublicUrl(rawUrl)
  // Full-content feeds (Blogger, many personal blogs) run to several MB; the CDN caches the parsed result.
  const { text } = await fetchText(url.toString(), { headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, maxBytes: 12_000_000, timeoutMs: 15_000 })
  const doc = xml.parse(text) as Node
  const channel = (doc.rss as Node | undefined)?.channel as Node | undefined
  const feed = doc.feed as Node | undefined
  const rdf = doc['rdf:RDF'] as Node | undefined
  const feedTitle = label || txt(channel?.title ?? feed?.title ?? (rdf?.channel as Node | undefined)?.title) || url.hostname
  // The publisher's homepage host, for its logo: feeds often live on another host (feeds.arstechnica.com).
  const homepage = txt(channel?.link) || (arr(feed?.link as Node | Node[]).find((l) => l['@_rel'] === 'alternate' || !l['@_rel'])?.['@_href'] as string | undefined)
  let site = url.hostname.replace(/^(www|feeds?|rss|blog)\./, '')
  try {
    if (homepage) site = new URL(homepage, url).hostname.replace(/^www\./, '')
  } catch {
    /* keep the feed host */
  }

  const entries: Story[] = []
  if (feed) {
    for (const e of arr(feed.entry as Node | Node[])) {
      const links = arr(e.link as Node | Node[])
      const alt = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? links[0]
      const href = (alt?.['@_href'] as string | undefined) ?? txt(e.id)
      if (!href?.startsWith('http')) continue
      const html = txt(e.summary) || txt(e.content)
      const image = feedImage(e, links, `${txt(e.content)} ${txt(e.summary)}`, href)
      entries.push({ ...linkStory(href, txt(e.title), feedTitle, Date.parse(txt(e.published) || txt(e.updated)), txt(e.author), html, categories(e)), thumbnail: image })
    }
  } else {
    for (const i of arr((channel?.item ?? rdf?.item) as Node | Node[])) {
      const href = txt(i.link) || txt(i.guid)
      if (!href?.startsWith('http')) continue
      const html = txt(i.description) || txt(i['content:encoded'])
      const image = feedImage(i, [], `${txt(i['content:encoded'])} ${txt(i.description)}`, href)
      entries.push({ ...linkStory(href, txt(i.title), feedTitle, Date.parse(txt(i.pubDate) || txt(i['dc:date'])), txt(i['dc:creator']) || txt(i.author), html, categories(i)), thumbnail: image })
    }
  }
  return entries.slice(0, 40).map((e) => ({ ...e, site }))
}

// Tracking pixels, emoji and avatars that feeds embed in their content.
const NOT_A_PICTURE = /feedburner|\/~r\/|pixel|gravatar|s\.w\.org\/images\/core\/emoji|\/emoji\/|avatar|1x1|spacer|\.gif(\?|$)|\.svg(\?|$)/i

/** An item's picture: media tags, an image enclosure, then the first real <img> in its content. */
function feedImage(item: Node, links: Node[], html: string, base: string): string | undefined {
  const media = [
    ...arr(item['media:thumbnail'] as Node | Node[]),
    ...arr(item['media:content'] as Node | Node[]),
    ...arr((item['media:group'] as Node | undefined)?.['media:content'] as Node | Node[]),
    ...arr((item['media:group'] as Node | undefined)?.['media:thumbnail'] as Node | Node[]),
    ...arr(item.enclosure as Node | Node[]),
    ...links.filter((l) => l['@_rel'] === 'enclosure'),
  ]
  const candidates: string[] = []
  for (const m of media) {
    const src = (m['@_url'] ?? m['@_href']) as string | undefined
    const type = `${m['@_type'] ?? ''} ${m['@_medium'] ?? ''}`
    if (src && (/image/.test(type) || (!type.trim() && /\.(jpe?g|png|webp|avif)(\?|$)/i.test(src)))) candidates.push(src)
  }
  for (const m of html.slice(0, 200_000).matchAll(/<img\b[^<>]{0,2000}?\bsrc=["']([^"']+)["']/gi)) candidates.push(m[1].replace(/&amp;/g, '&'))
  for (const c of candidates) {
    if (NOT_A_PICTURE.test(c)) continue
    try {
      const u = new URL(c, base)
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString()
    } catch {
      /* bad src */
    }
  }
  return undefined
}

// Feeds love to tag their own links (LeadDev appends utm_source=leaddev&utm_medium=RSS).
function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw)
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|mc_|ref$|source$)/.test(k)) u.searchParams.delete(k)
    return u.toString()
  } catch {
    return raw
  }
}

/** RSS <category>text</category> and Atom <category term="..."/>; used for topic matching. */
function categories(node: Node): string[] | undefined {
  const cats = arr(node.category as unknown)
    .map((c) => (typeof c === 'object' && c ? (((c as Node)['@_term'] as string | undefined) ?? txt(c)) : txt(c)))
    .map((c) => c.trim())
    .filter((c) => c && c.length < 40 && !/^uncategori[sz]ed$/i.test(c))
  return cats.length ? [...new Set(cats)].slice(0, 6) : undefined
}

function linkStory(rawUrl: string, title: string, label: string, createdAt: number, author: string, html: string, tags?: string[]): Story {
  const url = cleanUrl(rawUrl)
  return {
    key: linkKey(url),
    source: 'rss',
    sourceLabel: label,
    title: stripHtml(title) || url,
    url,
    discussionUrl: null,
    author: author || undefined,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    text: para(excerpt(html)),
    tags,
    hasThread: false,
  }
}

/* ------------------------------------------------------------ news search */

/**
 * Headlines matching a search, from anywhere: Bing News's RSS, which is offered for feed readers.
 * Its links go through a click-tracker carrying the real address, so stories link straight to the
 * publisher (and get the publisher's name, not "Bing"). This is what makes a free-text interest
 * ("Taylor Swift", "Murray-Darling") work for any subject, not just ones HN talks about.
 */
export function parseNewsSearch(text: string): Story[] {
  const doc = xml.parse(text) as Node
  const items = arr(((doc.rss as Node | undefined)?.channel as Node | undefined)?.item as Node | Node[])
  return items.flatMap((i): Story[] => {
    let href = txt(i.link)
    try {
      const u = new URL(href)
      const real = u.searchParams.get('url')
      if (/(^|\.)bing\.com$/.test(u.hostname) && real) href = real
    } catch {
      return []
    }
    if (!/^https?:\/\//.test(href)) return []
    const publisher = txt(i['News:Source'])
      .replace(/\s+on MSN$/i, '')
      .trim()
    const story = linkStory(href, txt(i.title), publisher || 'News', Date.parse(txt(i.pubDate)), '', txt(i.description))
    const image = txt(i['News:Image']).replace(/^http:/, 'https:')
    let site: string | undefined
    try {
      site = new URL(story.url!).hostname.replace(/^www\./, '')
    } catch {
      site = undefined
    }
    return [{ ...story, site, thumbnail: /^https:\/\/www\.bing\.com\/th\?/.test(image) ? image : undefined }]
  })
}

export async function newsSearch(q: string): Promise<Story[]> {
  const query = q.trim().slice(0, 200)
  if (!query) return []
  const { text } = await fetchText(`https://www.bing.com/news/search?${new URLSearchParams({ q: query, format: 'rss', setlang: 'en' })}`, {
    headers: { accept: 'application/rss+xml, text/xml' },
    timeoutMs: 10_000,
  })
  return parseNewsSearch(text)
}

/* ------------------------------------------------------------------ arXiv */

export async function arxiv(query: string): Promise<Story[]> {
  const params = new URLSearchParams({ search_query: query, sortBy: 'submittedDate', sortOrder: 'descending', max_results: '40' })
  const { text } = await fetchText(`https://export.arxiv.org/api/query?${params}`, { timeoutMs: 15_000 })
  const doc = xml.parse(text) as Node
  return arr((doc.feed as Node).entry as Node | Node[]).map((e) => {
    const absUrl = txt(e.id)
      .replace(/^http:/, 'https:')
      .replace(/v\d+$/, '')
    const authors = arr(e.author as Node | Node[]).map((a) => txt(a.name))
    const primary = (e['arxiv:primary_category'] as Node | undefined)?.['@_term'] as string | undefined
    return {
      key: linkKey(absUrl),
      source: 'arxiv' as const,
      sourceLabel: 'arXiv',
      title: txt(e.title).replace(/\s+/g, ' ').trim(),
      url: absUrl,
      discussionUrl: null,
      author: authors.length > 2 ? `${authors[0]} et al.` : authors.join(', '),
      createdAt: Date.parse(txt(e.published)),
      text: para(excerpt(txt(e.summary), 600)),
      tags: primary ? [primary] : undefined,
      hasThread: false,
    }
  })
}

/* ------------------------------------------------------- Hugging Face papers */

interface HfPaper {
  paper: { id: string; title: string; summary: string; upvotes: number; publishedAt: string; authors: { name: string }[]; ai_keywords?: string[] }
  numComments: number
  publishedAt: string
}

export async function hfPapers(): Promise<Story[]> {
  const data = await fetchJson<HfPaper[]>('https://huggingface.co/api/daily_papers?limit=50')
  return data.map(({ paper, numComments, publishedAt }) => {
    const absUrl = `https://arxiv.org/abs/${paper.id}`
    const authors = paper.authors.map((a) => a.name)
    return {
      key: linkKey(absUrl),
      source: 'hf' as const,
      sourceLabel: 'HF Papers',
      title: paper.title.replace(/\s+/g, ' ').trim(),
      url: absUrl,
      discussionUrl: `https://huggingface.co/papers/${paper.id}`,
      author: authors.length > 2 ? `${authors[0]} et al.` : authors.join(', '),
      score: paper.upvotes,
      comments: numComments,
      createdAt: Date.parse(publishedAt || paper.publishedAt),
      text: para(excerpt(paper.summary, 600)),
      tags: paper.ai_keywords?.slice(0, 5),
      hasThread: false,
    }
  })
}

/* ------------------------------------------------------- GitHub releases */

// Pre-releases, nightlies and release candidates: the radar is for versions people will run.
const PRERELEASE = /(^|[^a-z])(rc|alpha|beta|nightly|canary|dev|pre|preview|snapshot)[.\-_]?\d*\b/i

/**
 * A repository's releases from its public Atom feed (no API key, no API rate limit): the newest
 * couple from the last 45 days, skipping pre-releases.
 */
export function parseReleases(xmlText: string, repo: string, now = Date.now()): Story[] {
  const doc = xml.parse(xmlText) as Node
  const entries = arr((doc.feed as Node | undefined)?.entry as Node | Node[])
  const name = repo.split('/')[1]
  const out: Story[] = []
  for (const e of entries) {
    const href = (arr(e.link as Node | Node[])[0]?.['@_href'] as string | undefined) ?? ''
    const tag = decodeURIComponent(href.split('/releases/tag/')[1] ?? '')
    const title = stripHtml(txt(e.title))
    const at = Date.parse(txt(e.updated))
    if (!href.startsWith('https://github.com/') || !tag || PRERELEASE.test(tag) || PRERELEASE.test(title)) continue
    if (!Number.isFinite(at) || now - at > 45 * 86_400_000) continue
    // Titles are often just the tag; say which project it is.
    const label = title && title !== tag && !title.startsWith(tag) ? `${name} ${tag}: ${title}` : `${name} ${title || tag}`
    out.push({
      key: linkKey(href),
      source: 'release',
      sourceLabel: repo,
      title: label,
      url: href,
      discussionUrl: null,
      author: txt((e.author as Node | undefined)?.name) || undefined,
      createdAt: at,
      text: para(excerpt(txt(e.content), 400)),
      tags: ['release'],
      hasThread: false,
      site: 'github.com',
    })
    if (out.length >= 2) break
  }
  return out
}

export async function releases(repos: string[]): Promise<Story[]> {
  const valid = repos.filter((r) => /^[\w.-]+\/[\w.-]+$/.test(r)).slice(0, 40)
  const out: Story[] = []
  let reached = 0
  let lastError: unknown
  for (let i = 0; i < valid.length; i += 8) {
    const batch = await Promise.allSettled(
      valid.slice(i, i + 8).map(async (repo) => parseReleases((await fetchText(`https://github.com/${repo}/releases.atom`, { timeoutMs: 8000, maxBytes: 3_000_000 })).text, repo)),
    )
    for (const r of batch) {
      if (r.status === 'fulfilled') {
        reached++
        out.push(...r.value)
      } else lastError = r.reason
    }
  }
  // One missing repo is noise; none reachable is an outage worth reporting.
  if (valid.length && !reached) throw lastError instanceof Error ? lastError : new Error('GitHub release feeds unreachable')
  return out.sort((a, b) => b.createdAt - a.createdAt)
}

/* ----------------------------------------------------------------- GitHub */

interface GhRepo {
  full_name: string
  html_url: string
  description: string | null
  stargazers_count: number
  created_at: string
  pushed_at: string
  topics?: string[]
  language: string | null
  owner: { login: string }
}

export async function github(query: string, days = 7): Promise<Story[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const q = `${query} created:>${since}`.trim()
  const params = new URLSearchParams({ q, sort: 'stars', order: 'desc', per_page: '40' })
  const headers: Record<string, string> = { accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const data = await fetchJson<{ items: GhRepo[] }>(`https://api.github.com/search/repositories?${params}`, { headers })
  return data.items.map((r) => ({
    key: linkKey(r.html_url),
    source: 'github' as const,
    sourceLabel: 'GitHub',
    title: r.full_name,
    url: r.html_url,
    discussionUrl: null,
    author: r.owner.login,
    score: r.stargazers_count,
    createdAt: Date.parse(r.created_at),
    text: para(r.description ?? undefined),
    tags: [r.language, ...(r.topics ?? [])].filter((t): t is string => !!t).slice(0, 6),
    hasThread: false,
  }))
}
