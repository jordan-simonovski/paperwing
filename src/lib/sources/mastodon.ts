import { parseStoryKey, storyKey } from '../storyKey'
import { isGifLink } from '../bskyPost'
import { DEFAULT_INSTANCE, useMastodon } from '../mastodon'
import { matchesTopic, storyText, TOPICS } from '../topics'
import type { Comment, Media, Quote, Story, Thread } from '../types'
import { FetchError, getJson, linkKey } from './http'
import { webUrl } from '../webUrl'

// Mastodon, read through one server: yours if you've signed in, Hachyderm (a tech server) if not.
// Trends, hashtags and threads are public and CORS-open, so they are fetched from the browser.

interface Account {
  acct: string
  display_name: string
  url: string
  bot?: boolean
}
interface Attachment {
  type: 'image' | 'video' | 'gifv' | 'audio' | 'unknown'
  url: string
  preview_url?: string
  description?: string | null
  meta?: { original?: { aspect?: number }; small?: { aspect?: number } }
}
export interface Status {
  id: string
  created_at: string
  in_reply_to_id: string | null
  sensitive: boolean
  spoiler_text: string
  visibility: string
  url: string | null
  uri: string
  content: string
  account: Account
  media_attachments: Attachment[]
  card: { url: string; title: string; description?: string; image?: string | null; type: string } | null
  tags: { name: string }[]
  replies_count: number
  reblogs_count: number
  favourites_count: number
  reblog: Status | null
  language?: string | null
  /** Mastodon 4.5+ quote posts: the quoted status once its author has allowed the quote. */
  quote?: { state?: string; quoted_status?: Status | null } | null
}
interface TrendingLink {
  url: string
  title: string
  description?: string
  image?: string | null
  provider_name?: string
  published_at?: string | null
  history: { day: string; accounts: string; uses: string }[]
}

const server = () => useMastodon.getState().instance
export const auth = (instance: string): HeadersInit | undefined => {
  const { token, acct } = useMastodon.getState()
  return token && acct?.endsWith(`@${instance}`) ? { Authorization: `Bearer ${token}` } : undefined
}
const get = <T>(instance: string, path: string) => getJson<T>(`https://${instance}${path}`, { headers: auth(instance) })

/** Mastodon hides the scheme and tail of long links with classes the sanitizer strips; drop them here. */
export function cleanHtml(html: string): string {
  return html
    .replace(/<span class="invisible">[^<]*<\/span>/g, '')
    .replace(/<span class="ellipsis">([^<]*)<\/span>/g, '$1…')
    .replace(/<p class="quote-inline">[\s\S]*?<\/p>/g, '')
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
/** The post as plain lines, for its title. */
const lines = (html: string) =>
  decode(
    cleanHtml(html)
      .replace(/<br\s*\/?>|<\/p>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

/** md-<server>-<id>: ids are the server's own, so the key carries which server it came from. */
export const keyFor = (instance: string, id: string) => storyKey({ kind: 'md', instance, id })
export function parseKey(key: string): { instance: string; id: string } {
  const p = parseStoryKey(key)
  return p?.kind === 'md' ? { instance: p.instance, id: p.id } : { instance: '', id: '' }
}

function media(s: Status): Media[] | undefined {
  // Sensitive media stays behind a link to the post rather than in the feed.
  if (s.sensitive) return undefined
  const out: Media[] = []
  for (const a of s.media_attachments) {
    const aspect = a.meta?.original?.aspect ?? a.meta?.small?.aspect
    if (a.type === 'image') out.push({ kind: 'image', thumb: a.preview_url || a.url, full: a.url, alt: a.description || undefined, aspect })
    else if (a.type === 'video' || a.type === 'gifv') out.push({ kind: 'video', thumb: a.preview_url || '', playlist: a.url, alt: a.description || undefined, aspect })
  }
  return out.length ? out : undefined
}

/** States in which a quoted post exists but its author withdrew it, or it's gone. Others (pending, blocked, muted) show nothing. */
const QUOTE_GONE = new Set(['deleted', 'revoked', 'rejected', 'unauthorized'])

/** The status a quote post quotes, read like any other status from the same server. */
export function quoteOf(instance: string, s: Status): Quote | undefined {
  const q = s.quote
  if (!q) return undefined
  if (q.state && q.state !== 'accepted') return QUOTE_GONE.has(q.state) ? { author: '', html: '', gone: true } : undefined
  const quoted = q.quoted_status
  if (!quoted) return q.state === 'accepted' ? { author: '', html: '', gone: true } : undefined
  const card = quoted.card?.type === 'link' && webUrl(quoted.card.url) && !isGifLink(quoted.card.url) ? quoted.card : undefined
  return {
    key: keyFor(instance, quoted.id),
    author: quoted.account.acct,
    name: quoted.account.display_name || undefined,
    html: cleanHtml(quoted.spoiler_text ? `<p>${escapeHtml(quoted.spoiler_text)}</p>` : quoted.content),
    url: webUrl(quoted.url ?? quoted.uri),
    createdAt: Date.parse(quoted.created_at),
    media: quoted.spoiler_text ? undefined : media(quoted),
    link: card ? { url: card.url, title: card.title || undefined } : undefined,
  }
}

export function statusStory(instance: string, status: Status): Story {
  const s = status.reblog ?? status
  const link = s.card?.type === 'link' && webUrl(s.card.url) && !isGifLink(s.card.url) ? s.card : undefined
  const first = (s.spoiler_text ? [s.spoiler_text] : lines(s.content))[0] ?? 'Post'
  return {
    key: keyFor(instance, s.id),
    source: 'mastodon',
    sourceLabel: 'Mastodon',
    title: link?.title?.trim() || (first.length > 140 ? first.slice(0, 140).replace(/\s+\S*$/, '') + '…' : first),
    url: link?.url ?? null,
    discussionUrl: webUrl(s.url ?? s.uri) ?? null,
    author: s.account.acct,
    score: s.favourites_count + s.reblogs_count,
    comments: s.replies_count,
    createdAt: Date.parse(s.created_at),
    text: cleanHtml(s.content) || undefined,
    tags: s.tags.map((t) => t.name.toLowerCase()),
    thumbnail: link?.image ?? undefined,
    hasThread: true,
    media: media(s),
    quote: quoteOf(instance, s),
    // The author's own content warning; sensitive pictures are already left out (media()).
    warning: s.spoiler_text?.trim() || undefined,
  }
}

/** Hashtags cross languages: keep posts in the reader's languages, and English, which tech defaults to. */
const readable = (lang?: string | null) => !lang || ['en', ...(typeof navigator === 'undefined' ? [] : navigator.languages)].some((l) => l.toLowerCase().split('-')[0] === lang.toLowerCase())

/**
 * Original posts: replies aren't stories. Outside your own timeline, only public posts in a
 * language you read, and no automated accounts: hashtags are full of headline bots. Your own
 * timeline keeps whatever you chose to follow.
 */
const story =
  (instance: string, { home = false } = {}) =>
  (list: Status[]) =>
    list
      .filter((st) => {
        const s = st.reblog ?? st
        return !s.in_reply_to_id && (home || (s.visibility === 'public' && !s.account.bot && readable(s.language)))
      })
      .map((st) => (home ? { ...statusStory(instance, st), followed: true } : statusStory(instance, st)))

/** Posts with any of these hashtags, as the server sees the fediverse. */
export async function mastodonTags(tags: string[]): Promise<Story[]> {
  const instance = server()
  const [first, ...rest] = tags
  const qs = new URLSearchParams({ limit: '40' })
  for (const t of rest) qs.append('any[]', t)
  return story(instance)(await get<Status[]>(instance, `/api/v1/timelines/tag/${encodeURIComponent(first)}?${qs}`))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Your home timeline. A server stops keeping it for accounts that haven't been around in a while
 * and rebuilds it on the next visit, answering 206 with what it has so far (often nothing) until
 * it's done. PaperWing waits for it rather than showing an empty feed.
 */
export async function mastodonHome(): Promise<Story[]> {
  const instance = server()
  const headers = auth(instance)
  if (!headers) throw new Error('Sign in to Mastodon in Settings to see who you follow')
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://${instance}/api/v1/timelines/home?limit=40`, { headers })
    if (res.status === 401) throw new FetchError(`${instance} no longer accepts PaperWing's sign-in. Sign out and back in under Settings`, 401)
    if (!res.ok) throw new FetchError(`${instance} answered ${res.status} ${res.statusText}`, res.status)
    const list = (await res.json()) as Status[]
    if (res.status !== 206) return story(instance, { home: true })(list)
    if (attempt >= 5) {
      if (list.length) return story(instance, { home: true })(list)
      throw new FetchError(`${instance} is still putting your home timeline together. Pull to refresh in a minute`, 206)
    }
    // Mastodon-Async-Refresh: id="…", retry=5, result_count=0
    const retry = Number(res.headers.get('Mastodon-Async-Refresh')?.match(/retry=(\d+)/)?.[1] ?? 3)
    await sleep(Math.min(10, Math.max(1, retry)) * 1000)
  }
}

const techOnly = (s: Story) => TOPICS.some((t) => matchesTopic(t, storyText(s)))

/** What the server's people are sharing and boosting, kept to tech. */
export async function mastodonTrends(): Promise<Story[]> {
  const instance = server()
  const [links, statuses] = await Promise.all([get<TrendingLink[]>(instance, '/api/v1/trends/links?limit=20'), get<Status[]>(instance, '/api/v1/trends/statuses?limit=20')])
  const now = Date.now()
  const linkStories = links.map(
    (l): Story => ({
      key: linkKey(l.url),
      source: 'mastodon',
      sourceLabel: 'Mastodon',
      title: l.title.trim(),
      url: webUrl(l.url) ?? null,
      discussionUrl: null,
      // History is newest day first: people sharing it over the last two days.
      score: l.history.slice(0, 2).reduce((n, h) => n + Number(h.accounts), 0),
      createdAt: Date.parse(l.published_at ?? '') || now,
      text: l.description ? `<p>${escapeHtml(l.description)}</p>` : undefined,
      thumbnail: l.image ?? undefined,
      hasThread: false,
    }),
  )
  return [...linkStories, ...story(instance)(statuses)].filter(techOnly)
}

/** Replies arrive flat and in reading order; each names the post it answers. */
export function mastodonComments(descendants: Status[], rootId: string, instance = ''): Comment[] {
  const byId = new Map<string, Comment>()
  const roots: Comment[] = []
  for (const s of descendants) {
    const c: Comment = {
      id: s.id,
      author: s.account.acct,
      html: cleanHtml(s.content),
      createdAt: Date.parse(s.created_at),
      score: s.favourites_count,
      url: webUrl(s.url ?? s.uri),
      media: media(s),
      quote: quoteOf(instance, s),
      children: [],
    }
    byId.set(s.id, c)
    if (s.in_reply_to_id === rootId) roots.push(c)
    else byId.get(s.in_reply_to_id ?? '')?.children.push(c)
  }
  return roots
}

/** Big public servers a shared link may name, besides your own. */
const KNOWN_INSTANCES = ['mastodon.social', 'mastodon.online', 'mas.to', 'mstdn.social', 'fosstodon.org', 'infosec.exchange', 'techhub.social', 'universeodon.com', 'mastodon.world', 'hachyderm.io']

export async function mastodonThread(key: string): Promise<Thread> {
  const { instance, id } = parseKey(key)
  // A link can name any server, and whatever it answered would show as a post inside PaperWing.
  // So only yours and well-known ones.
  if (instance !== server() && instance !== DEFAULT_INSTANCE && !KNOWN_INSTANCES.includes(instance))
    throw new FetchError(`PaperWing doesn’t read posts from ${instance}. Open it on its own site.`, 400)
  const [status, context] = await Promise.all([get<Status>(instance, `/api/v1/statuses/${id}`), get<{ descendants: Status[] }>(instance, `/api/v1/statuses/${id}/context`)])
  return { story: statusStory(instance, status), comments: mastodonComments(context.descendants, status.id, instance) }
}
