import { isSelfPost, SELF_LINK_TEXT } from './paperwing.js'
import { storyKey } from './storyKey.js'
// What a Bluesky post shares, read the same way by the feed generator and the client.
import type { Media, Quote } from './types.js'
import { webUrl } from './webUrl.js'

interface ImageView {
  thumb: string
  fullsize: string
  alt?: string
  aspectRatio?: { width: number; height: number }
}
interface MediaEmbed {
  $type: string
  external?: { uri: string; title?: string; description?: string; thumb?: string }
  images?: ImageView[]
  playlist?: string
  thumbnail?: string
  alt?: string
  aspectRatio?: { width: number; height: number }
}
/** A quoted post as an embed carries it: the post itself, or a stand-in when it can't be shown. */
interface QuotedRecord {
  $type: string
  uri?: string
  author?: { handle: string; displayName?: string }
  value?: { text?: string; createdAt?: string }
  embeds?: (MediaEmbed & { media?: MediaEmbed })[]
  indexedAt?: string
}
export interface Shareable {
  /** The post's own address: a self post's card links to its page on PaperWing, which names it. */
  uri?: string
  record: { text: string; facets?: { features?: { $type: string; uri?: string }[] }[] }
  embed?: MediaEmbed & { media?: MediaEmbed; record?: QuotedRecord & { record?: QuotedRecord } }
}

const EXTERNAL = 'app.bsky.embed.external#view'
// GIF pickers attach as link cards, but a reaction GIF isn't something being shared.
const GIF_HOST = /(^|\.)(tenor\.com|giphy\.com|klipy\.com|gfycat\.com)$/i

export const isGifLink = (uri?: string) => {
  try {
    return !!uri && GIF_HOST.test(new URL(uri).hostname)
  } catch {
    return false
  }
}
const IMAGES = 'app.bsky.embed.images#view'
const VIDEO = 'app.bsky.embed.video#view'

const cardOf = (p: Shareable) => (p.embed?.$type === EXTERNAL ? p.embed.external?.uri : p.embed?.media?.$type === EXTERNAL ? p.embed.media.external?.uri : undefined)

/** A PaperWing self post: its card links to its own page, where its words are (paperwing.ts). */
export const selfPostOf = (p: Shareable) =>
  !!p.uri &&
  // A link card to its own page, or (a picture post, which has no card) a link to it in its words.
  (isSelfPost(cardOf(p), p.uri) || (p.record.facets ?? []).some((f) => (f.features ?? []).some((x) => x.$type === 'app.bsky.richtext.facet#link' && isSelfPost(x.uri, p.uri!))))

/** A post's words; a self post's without the link back to its page here (where they're being read). */
export const postWords = (p: Shareable) => {
  const text = p.record.text.trim()
  // Only a picture post (no card) has the link back in its words.
  return selfPostOf(p) && !cardOf(p) && text.endsWith(SELF_LINK_TEXT) ? text.slice(0, -SELF_LINK_TEXT.length).trim() : text
}

/** The link a post shares: its preview card, else the first link typed into the text (not other Bluesky posts). A self post shares none. */
export function sharedLink(p: Shareable): string | undefined {
  if (selfPostOf(p)) return undefined
  const card = cardOf(p)
  if (webUrl(card) && !isGifLink(card!)) return card
  for (const facet of p.record.facets ?? []) {
    for (const f of facet.features ?? []) {
      if (f.$type !== 'app.bsky.richtext.facet#link' || !f.uri) continue
      try {
        if (webUrl(f.uri) && !/(^|\.)bsky\.app$/.test(new URL(f.uri).hostname)) return f.uri
      } catch {
        /* not a URL */
      }
    }
  }
  return undefined
}

const ratio = (a?: { width: number; height: number }) => (a && a.width > 0 && a.height > 0 ? a.width / a.height : undefined)

/** Images or video attached directly, or alongside a quoted post. */
export function postMedia(p: Shareable): Media[] | undefined {
  const m = p.embed?.$type === IMAGES || p.embed?.$type === VIDEO ? p.embed : p.embed?.media
  if (m?.$type === IMAGES && m.images?.length) return m.images.map((i) => ({ kind: 'image', thumb: i.thumb, full: i.fullsize, alt: i.alt || undefined, aspect: ratio(i.aspectRatio) }))
  if (m?.$type === VIDEO && m.thumbnail) return [{ kind: 'video', thumb: m.thumbnail, playlist: m.playlist, alt: m.alt || undefined, aspect: ratio(m.aspectRatio) }]
  return undefined
}

const RECORD = 'app.bsky.embed.record#view'
const RECORD_WITH_MEDIA = 'app.bsky.embed.recordWithMedia#view'
const VIEW_RECORD = 'app.bsky.embed.record#viewRecord'
/** Quoted posts that exist but can't be shown: deleted, blocked, or detached by their author. */
const GONE = new Set(['app.bsky.embed.record#viewNotFound', 'app.bsky.embed.record#viewBlocked', 'app.bsky.embed.record#viewDetached'])

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Plain post text to safe HTML: paragraphs, line breaks and bare links made clickable. */
export function postHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map(
      (para) =>
        `<p>${escapeHtml(para)
          .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]]/g, (u) => `<a href="${u}">${u}</a>`)
          .replace(/\n/g, '<br>')}</p>`,
    )
    .join('')
}

/** The app's key for a Bluesky post: its at:// URI, base64url. Works in the browser and on the server. */
export const bskyKeyOf = (uri: string): string => storyKey({ kind: 'bs', uri })

/** The post a quote post quotes, with its own images and link card. */
export function quotedPost(p: Shareable): Quote | undefined {
  const r = p.embed?.$type === RECORD ? p.embed.record : p.embed?.$type === RECORD_WITH_MEDIA ? p.embed.record?.record : undefined
  if (!r) return undefined
  if (GONE.has(r.$type)) return { author: '', html: '', gone: true }
  // Other records (feeds, lists, starter packs) aren't posts.
  if (r.$type !== VIEW_RECORD || !r.uri || !r.author || !/\/app\.bsky\.feed\.post\//.test(r.uri)) return undefined
  const inner = r.embeds?.[0]
  const shared: Shareable = { record: { text: r.value?.text ?? '' }, embed: inner }
  const card = inner?.external ?? inner?.media?.external
  const created = Date.parse(r.value?.createdAt ?? r.indexedAt ?? '')
  return {
    key: bskyKeyOf(r.uri),
    author: r.author.handle,
    name: r.author.displayName || undefined,
    html: postHtml(r.value?.text ?? ''),
    url: `https://bsky.app/profile/${r.author.handle}/post/${r.uri.split('/').pop()}`,
    createdAt: Number.isFinite(created) ? created : undefined,
    media: postMedia(shared),
    link: card && !isGifLink(card.uri) ? { url: card.uri, title: card.title || undefined } : undefined,
  }
}
