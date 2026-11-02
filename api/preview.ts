import { HOME } from '../src/lib/oauthClient.js'
import type { Story } from '../src/lib/types.js'
import { posts } from './_lib/atlinks.js'
import { toStory } from './_lib/bsky.js'
import { fetchJson } from './_lib/http.js'
import { ogImage, pageCard } from './_lib/og.js'
import { actorOf, person } from './_lib/people.js'
import { lobstersThread } from './_lib/sources.js'

// A story link's preview card. When someone pastes a PaperWing story link into Bluesky, Mastodon,
// iMessage or Slack, the site that draws the card fetches the link without running any script, so
// the app's own page would only ever show PaperWing's generic card. vercel.json sends those
// fetchers (and only them, by user agent) here instead: a tiny page with the story's own title,
// description and picture. People clicking the link get the app as usual.

interface Card {
  title: string
  description: string
  image?: string
  /** A square picture (an avatar): shown as a small card, not cropped into a wide one. */
  small?: boolean
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const plain = (html = '') =>
  html
    .replace(/<[^<>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s)
const count = (n: number | undefined, one: string) => (n ? `${n.toLocaleString('en')} ${one}${n === 1 ? '' : 's'}` : undefined)

/** A link's own card (its title, summary and picture), for stories that share one. */
async function linkCard(url: string): Promise<Partial<Card>> {
  const [card, image] = await Promise.all([pageCard(url).catch(() => ({}) as { title?: string; description?: string }), ogImage(url).catch(() => undefined)])
  return { title: card.title, description: card.description, image }
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Builds the card from what the story is: a link, an HN item, a Bluesky post or a Lobsters story. */
async function cardFor(key: string): Promise<Card | undefined> {
  const prefix = key.slice(0, 3)
  if (prefix === 'ln-') {
    const url = Buffer.from(key.slice(3), 'base64url').toString('utf8')
    if (!/^https?:\/\//.test(url)) return undefined
    const c = await linkCard(url)
    return { title: c.title ?? host(url), description: c.description ?? `From ${host(url)}, with every discussion about it on PaperWing`, image: c.image }
  }
  if (prefix === 'hn-' && /^\d{1,10}$/.test(key.slice(3))) {
    const item = await fetchJson<{ title?: string; url?: string; text?: string; score?: number; descendants?: number; dead?: boolean; deleted?: boolean }>(
      `https://hacker-news.firebaseio.com/v0/item/${key.slice(3)}.json`,
      { timeoutMs: 5000 },
    )
    if (!item?.title || item.dead || item.deleted) return undefined
    const c = item.url ? await linkCard(item.url) : {}
    const stats = [count(item.score, 'point'), count(item.descendants, 'comment')].filter(Boolean).join(' · ')
    return {
      title: item.title,
      description: [stats && `${stats} on Hacker News`, c.description ?? (item.text ? plain(item.text) : undefined)].filter(Boolean).join('. '),
      image: c.image,
    }
  }
  if (prefix === 'bs-') {
    const uri = Buffer.from(key.slice(3), 'base64url').toString('utf8')
    if (!/^at:\/\/did:[a-z]+:[a-zA-Z0-9._:%-]+\/app\.bsky\.feed\.post\/[a-z2-7]+$/.test(uri)) return undefined
    const [post] = await posts([uri])
    if (!post) return undefined
    const story: Story = toStory(post)
    // Anything labelled (adult content, graphic media, spam) gets a plain card: no picture, no text.
    if (story.labels?.length) return { title: 'A post on Bluesky', description: 'Read it, and the discussion, on PaperWing.' }
    const stats = [count(story.score, 'like'), count(story.comments, 'reply')].filter(Boolean).join(' · ')
    const c = story.url ? await linkCard(story.url) : {}
    return {
      title: story.title,
      description: [`@${story.author} on Bluesky${stats ? ` · ${stats}` : ''}`, clip(plain(story.text), 200)].filter(Boolean).join(': '),
      image: c.image ?? story.thumbnail ?? story.media?.find((m) => m.kind === 'image')?.thumb,
    }
  }
  if (prefix === 'lb-' && /^[a-z0-9]{1,12}$/.test(key.slice(3))) {
    const { story } = await lobstersThread(key.slice(3))
    const c = story.url ? await linkCard(story.url) : {}
    const stats = [count(story.score, 'vote'), count(story.comments, 'comment')].filter(Boolean).join(' · ')
    return { title: story.title, description: [stats && `${stats} on Lobsters`, c.description].filter(Boolean).join('. '), image: c.image }
  }
  return undefined
}

/** Someone's profile: their name, bio and what they've listed, with their avatar. */
async function profileCard(raw: string): Promise<Card | undefined> {
  const actor = actorOf(raw)
  if (!actor) return undefined
  const { profile, totals } = await person(actor)
  const who = profile.name ? `${profile.name} (@${profile.handle})` : `@${profile.handle}`
  const listed = totals.listed ? `${totals.listed.toLocaleString('en')} ${totals.listed === 1 ? 'story' : 'stories'} listed on PaperWing` : 'On PaperWing'
  return { title: `${who} on PaperWing`, description: [listed, profile.bio].filter(Boolean).join('. '), image: profile.avatar, small: !!profile.avatar }
}

function page(card: Card, canonical: string): string {
  const title = clip(card.title, 200)
  const description = clip(card.description, 300)
  const image = card.image && /^https:\/\//.test(card.image) ? card.image : `https://${HOME}/og.png`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)} · PaperWing</title>
<link rel="canonical" href="${esc(canonical)}">
<meta name="description" content="${esc(description)}">
<meta property="og:site_name" content="PaperWing">
<meta property="og:type" content="article">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="${card.small ? 'summary' : 'summary_large_image'}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
</head><body><h1>${esc(title)}</h1><p>${esc(description)}</p><p><a href="${esc(canonical)}">Read it on PaperWing</a></p></body></html>`
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  // The app path the link pointed at (/t/<channel>/<key>), passed on by the rewrite.
  const path = url.searchParams.get('path') ?? ''
  const match = /^\/(t\/[A-Za-z0-9:@._%-]{1,200}|today)\/([A-Za-z0-9._@-]{3,1200})$/.exec(path)
  const profile = /^\/u\/([A-Za-z0-9:@._%-]{3,260})$/.exec(path)
  const canonical = `https://${HOME}${match || profile ? path : '/'}`
  let card: Card | undefined
  if (match) card = await cardFor(match[2]).catch(() => undefined)
  if (profile) card = await profileCard(decodeURIComponent(profile[1])).catch(() => undefined)
  card ??= { title: 'PaperWing', description: 'News from the open web, in one reader: Hacker News, Lemmy, Bluesky, Mastodon and the publishers you trust.' }
  return new Response(page(card, canonical), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Cards are fetched once per post that shares them: a day at the edge keeps it cheap.
      'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src https:; style-src 'unsafe-inline'",
    },
  })
}
