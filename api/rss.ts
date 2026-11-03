import { TOPIC_BY_ID } from '../src/lib/topics.js'
import { HOME } from '../src/lib/oauthClient.js'
import type { Story } from '../src/lib/types.js'
import { fetchJson } from './_lib/http.js'
import { linkStories, readMix } from './_lib/mixfeed.js'
import { paperwingFront } from './_lib/paperwing.js'
import { boardFront, readBoard } from './_lib/boards.js'
import { actorOf, person } from './_lib/people.js'
import { escapeHtml as esc, siteOf } from './_lib/text.js'
import { StandardRateLimit } from './_lib/standard.js'

// RSS out: PaperWing's own pages as feeds any reader can follow, so nothing here only works inside
// PaperWing. /rss/front (the front page), /rss/board/<topic>, /rss/topic/<topic>, /rss/mix/<did>/<rkey>
// and /rss/u/<handle> (what someone lists and shares). Built from public data on the server; cached
// at the edge for ten minutes.

interface Feed {
  title: string
  description: string
  /** The page on PaperWing this feed mirrors. */
  page: string
  items: (Story & { note?: string })[]
}

const ORIGIN = `https://${HOME}`
const host = (u: string) => siteOf(u)

/** The address names no feed: worth caching. Anything else that goes wrong is a hiccup, which isn't. */
class NotFound extends Error {}

/**
 * The feed's own subject (a person, a mix, a board) is gone if the network says so (400 or 404) or
 * the record isn't one. Only that lookup counts: a 400 from something read along the way (a
 * moderator's hides) is a hiccup in a feed that exists.
 */
const orGone = <T>(lookup: Promise<T>): Promise<T> =>
  lookup.catch((err: unknown) => {
    if (err instanceof Error && /\bUpstream 40[04]\b|^Not a |empty or malformed/.test(err.message)) throw new NotFound(err.message)
    throw err
  })

/** A topic: its publishers and its best recent Hacker News stories. */
async function topicFeed(id: string): Promise<Feed> {
  const topic = TOPIC_BY_ID.get(id)
  if (!topic) throw new NotFound('No such topic')
  const [published, hn] = await Promise.all([
    linkStories([{ kind: 'topic', id }]).catch(() => [] as Story[]),
    topic.hnQuery
      ? fetchJson<{ hits: { objectID: string; title: string; url?: string; points: number; num_comments: number; created_at_i: number; author: string }[] }>(
          `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(topic.hnQuery)}&tags=story&numericFilters=points>40,created_at_i>${
            Math.floor(Date.now() / 1000) - 3 * 86_400
          }&hitsPerPage=20`,
          { timeoutMs: 6000 },
        )
          .then((r) =>
            r.hits.map(
              (h): Story => ({
                key: `hn-${h.objectID}`,
                source: 'hn',
                sourceLabel: 'Hacker News',
                title: h.title,
                url: h.url ?? null,
                discussionUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
                author: h.author,
                score: h.points,
                comments: h.num_comments,
                createdAt: h.created_at_i * 1000,
                hasThread: true,
              }),
            ),
          )
          .catch(() => [] as Story[])
      : Promise.resolve([] as Story[]),
  ])
  const seen = new Set<string>()
  const items = [...hn, ...published].filter((s) => !s.url || (!seen.has(s.url) && !!seen.add(s.url))).sort((a, b) => b.createdAt - a.createdAt)
  return { title: `${topic.label} on PaperWing`, description: topic.blurb ?? `${topic.label}, from publishers and Hacker News`, page: `${ORIGIN}/t/${id}`, items: items.slice(0, 40) }
}

async function build(parts: string[], request: Request): Promise<Feed> {
  const [kind, a, b] = parts
  switch (kind) {
    case 'front':
    case undefined:
    case '':
      return { title: 'PaperWing front page', description: 'What people list on PaperWing, ranked by its Bluesky likes and replies', page: `${ORIGIN}/t/paperwing`, items: await paperwingFront('hot') }
    case 'new':
      return { title: 'PaperWing: new', description: 'Everything listed on PaperWing, newest first', page: `${ORIGIN}/t/paperwing?sort=new`, items: await paperwingFront('new') }
    case 'board': {
      const topic = TOPIC_BY_ID.get(a ?? '')
      if (!topic) throw new NotFound('No such board')
      return {
        title: `PaperWing: ${topic.label}`,
        description: `Stories listed on PaperWing’s ${topic.label} board`,
        page: `${ORIGIN}/t/paperwing:${topic.id}`,
        items: await paperwingFront('hot', topic.id),
      }
    }
    case 'topic':
      return topicFeed(a ?? '')
    case 'c': {
      await orGone(readBoard(a ?? '', b ?? ''))
      const { board, stories } = await boardFront(a ?? '', b ?? '', 'hot')
      return { title: `${board.name} on PaperWing`, description: board.description ?? 'A community board on PaperWing', page: `${ORIGIN}/c/${a}/${b}`, items: stories }
    }
    case 'mix': {
      if (!a || !b) throw new NotFound('A mix feed needs its owner and id')
      const { mix, handle } = await orGone(readMix(`at://${a}/io.paperwing.mix/${b}`))
      return {
        title: `${mix.name}: a PaperWing mix${handle ? ` by @${handle}` : ''}`,
        description: mix.description ?? 'A mix of sources on PaperWing',
        page: `${ORIGIN}/mix/${a}/${b}`,
        items: await linkStories(mix.sources, request),
      }
    }
    case 'u': {
      const actor = actorOf(decodeURIComponent(a ?? ''))
      if (!actor) throw new NotFound('Not a handle')
      const p = await orGone(person(actor))
      const who = p.profile.name ? `${p.profile.name} (@${p.profile.handle})` : `@${p.profile.handle}`
      const items = [...p.stories, ...(p.shares ?? [])].sort((x, y) => y.createdAt - x.createdAt)
      return { title: `${who} on PaperWing`, description: `What ${who} lists and shares on PaperWing`, page: `${ORIGIN}/u/${p.profile.handle}`, items }
    }
    default:
      throw new NotFound('No such feed')
  }
}

export function toRss(feed: Feed, self: string): string {
  const items = feed.items
    .map((s) => {
      const link = s.url ?? s.discussionUrl ?? feed.page
      const where = [s.sourceLabel, s.url ? host(s.url) : '', s.author ? `@${s.author.replace(/^@/, '')}` : ''].filter(Boolean).join(' · ')
      const body = [
        s.note ? `<p>${esc(s.note)}</p>` : '',
        `<p>${esc(where)}</p>`,
        s.discussionUrl && s.discussionUrl !== link ? `<p><a href="${esc(s.discussionUrl)}">Discussion</a></p>` : '',
        `<p><a href="${esc(`${ORIGIN}/t/for-you/${s.key}`)}">Every discussion on PaperWing</a></p>`,
      ].join('')
      return `<item><title>${esc(s.title)}</title><link>${esc(link)}</link><guid isPermaLink="false">${esc(s.key)}</guid><pubDate>${new Date(s.createdAt).toUTCString()}</pubDate>${
        s.author ? `<dc:creator>${esc(s.author)}</dc:creator>` : ''
      }<description>${esc(body)}</description>${s.discussionUrl ? `<comments>${esc(s.discussionUrl)}</comments>` : ''}</item>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>${esc(feed.title)}</title>
<link>${esc(feed.page)}</link>
<description>${esc(feed.description)}</description>
<atom:link href="${esc(self)}" rel="self" type="application/rss+xml"/>
<image><url>${ORIGIN}/icon-192.png</url><title>${esc(feed.title)}</title><link>${esc(feed.page)}</link></image>
<generator>PaperWing</generator>
${items}
</channel>
</rss>`
}

export async function GET(request: Request): Promise<Response> {
  const path = (new URL(request.url).searchParams.get('path') ?? '').replace(/^\/+|\/+$/g, '')
  const parts = path.split('/').filter(Boolean)
  try {
    const feed = await build(parts, request)
    return new Response(toRss(feed, `${ORIGIN}/rss${path ? `/${path}` : ''}`), {
      headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=600, s-maxage=600, stale-while-revalidate=3600', 'access-control-allow-origin': '*' },
    })
  } catch (err) {
    const missing = err instanceof NotFound
    return new Response(missing ? err.message : 'This feed couldn’t be built just now. Try again shortly.', {
      status: missing ? 404 : err instanceof StandardRateLimit ? 429 : 502,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': missing ? 'public, s-maxage=300' : 'no-store' },
    })
  }
}
