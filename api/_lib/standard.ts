import type { Story } from '../../src/lib/types.js'
import { parseHTML } from 'linkedom'
import { getRecord, pdsOf, pool } from './frontpage.js'
import { assertPublicUrl, fetchJson, fetchText, linkKey } from './http.js'
import { escapeHtml } from './text.js'
import { cachedInKv, fanOutLimited } from './kv.js'

const DID = 'did:(?:plc:[a-z2-7]{24}|web:[a-z0-9.%:-]+)'
const publicationUri = new RegExp(`^at://(${DID})/site\\.standard\\.publication/([A-Za-z0-9_~:-][A-Za-z0-9._~:-]{0,511})$`)
const documentUri = new RegExp(`^at://(${DID})/site\\.standard\\.document/([A-Za-z0-9_~:-][A-Za-z0-9._~:-]{0,511})$`)
const object = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined)
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const canonical = (url: URL) => `${url.origin}${url.pathname.replace(/\/$/, '')}`
const verification = (url: URL) => `${url.origin}/.well-known/site.standard.publication${url.pathname.replace(/\/$/, '')}`
const headLinks = (html: string) => Array.from(parseHTML(html.slice(0, 600_000)).document.head.querySelectorAll('link'))

export class StandardRateLimit extends Error {
  constructor() {
    super('That was a lot at once. Try again in a minute.')
  }
}

export interface Publication {
  uri: string
  url: string
  name: string
}

/** A page's publication reference is a discovery hint only; the well-known endpoint verifies it. */
export function standardHint(html: string): string | undefined {
  for (const tag of headLinks(html)) {
    const rel = (tag.getAttribute('rel') ?? '').split(/\s+/)
    const uri = tag.getAttribute('href')
    if (uri && ((rel.includes('site.standard.publication') && publicationUri.test(uri)) || (rel.includes('site.standard.document') && documentUri.test(uri)))) return uri
  }
  return undefined
}

/** Read the author-owned publication, verified by its own website (including publications in a subfolder). */
export async function standardPublication(raw: string, hint?: string): Promise<Publication> {
  const requested = await assertPublicUrl(raw)
  let uri = hint
  if (uri && documentUri.test(uri)) {
    const doc = object((await getRecord<unknown>(uri)).value)
    if (typeof doc?.site !== 'string' || !publicationUri.test(doc.site) || publicationUri.exec(doc.site)?.[1] !== documentUri.exec(uri)?.[1])
      throw new Error('Malformed Standard.site document publication')
    uri = doc.site
  }
  let checked: string | undefined
  if (!uri) {
    for (const endpoint of [...new Set([verification(requested), `${requested.origin}/.well-known/site.standard.publication`])]) {
      const found = await fetchText(endpoint, { maxBytes: 2000, timeoutMs: 5000 }).catch(() => undefined)
      if (found && publicationUri.test(found.text.trim())) {
        uri = found.text.trim()
        checked = endpoint
        break
      }
    }
  }
  if (!uri || !publicationUri.test(uri)) throw new Error('No Standard.site publication found')
  const record = object((await getRecord<unknown>(uri)).value)
  if (!record || typeof record.url !== 'string' || !text(record.name, 120)) throw new Error('Malformed Standard.site publication')
  const url = await assertPublicUrl(record.url)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.origin !== requested.origin ||
    (canonical(requested) !== canonical(url) && !canonical(requested).startsWith(`${canonical(url)}/`))
  )
    throw new Error('Publication does not match this site')
  const endpoint = verification(url)
  if (checked !== endpoint) {
    const verified = await fetchText(endpoint, { maxBytes: 2000, timeoutMs: 5000 })
    if (verified.text.trim() !== uri) throw new Error('Publication could not be verified')
  }
  return { uri, url: canonical(url), name: text(record.name, 120) }
}

/** Native Standard.site documents, with their web pages confirming which record each belongs to. */
async function readStandardFeed(raw: string): Promise<Story[]> {
  const pub = await standardPublication(raw)
  const did = publicationUri.exec(pub.uri)![1]
  const pds = await pdsOf(did)
  const candidates: { uri: string; story: Story }[] = []
  let cursor: string | undefined
  // shortcut: scans the newest 300 documents per author, use a publication index for larger archives.
  for (let page = 0; page < 3; page++) {
    const params = new URLSearchParams({ repo: did, collection: 'site.standard.document', limit: '100', reverse: 'true', ...(cursor ? { cursor } : {}) })
    const result = await fetchJson<{ records: unknown[]; cursor?: string }>(`${pds}/xrpc/com.atproto.repo.listRecords?${params}`, { timeoutMs: 8000 })
    if (!Array.isArray(result.records)) throw new Error('Malformed Standard.site documents')
    for (const rawRecord of result.records.slice(0, 100)) {
      const record = object(rawRecord)
      const r = object(record?.value)
      if (!record || typeof record.uri !== 'string' || documentUri.exec(record.uri)?.[1] !== did || !r || (r.site !== pub.uri && r.site !== pub.url && r.site !== `${pub.url}/`)) continue
      const createdAt = typeof r.publishedAt === 'string' ? Date.parse(r.publishedAt) : NaN
      const title = text(r.title, 500)
      if (!title || !Number.isFinite(createdAt) || createdAt > Date.now() || (r.path !== undefined && (typeof r.path !== 'string' || !r.path.startsWith('/') || r.path.length > 2000))) continue
      const url = new URL(`${pub.url}${r.path ?? ''}`)
      const base = new URL(pub.url)
      if (url.origin !== base.origin || (url.pathname !== base.pathname && !url.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/`))) continue
      const labels = object(r.labels)
      const values = Array.isArray(labels?.values)
        ? labels.values.flatMap((v) => {
            const l = object(v)
            return typeof l?.val === 'string' ? [{ src: did, val: l.val }] : []
          })
        : []
      // Public publisher feeds and published mixes keep adult and hidden content out alike.
      if (values.some((l) => ['!hide', '!takedown', 'porn', 'sexual', 'nudity', 'graphic-media', 'gore', 'spam'].includes(l.val))) continue
      const description = text(r.description, 1000) || text(r.textContent, 1000)
      candidates.push({
        uri: record.uri,
        story: {
          key: linkKey(url.toString()),
          source: 'rss',
          sourceLabel: pub.name,
          title,
          url: url.toString(),
          discussionUrl: null,
          createdAt,
          author: did,
          authorDid: did,
          site: base.hostname,
          text: description ? `<p>${escapeHtml(description)}</p>` : undefined,
          tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string' && t.length < 80).slice(0, 6) : undefined,
          labels: values.length ? values : undefined,
          hasThread: false,
        },
      })
    }
    if (!result.cursor || !result.records.length) break
    if (typeof result.cursor !== 'string' || result.cursor.length > 2000 || cursor === result.cursor) throw new Error('Malformed Standard.site cursor')
    cursor = result.cursor
  }
  const seen = new Set<string>()
  const recent = candidates
    .sort((a, b) => b.story.createdAt - a.story.createdAt)
    .filter(({ story }) => !seen.has(story.url!) && !!seen.add(story.url!))
    .slice(0, 20)
  const verified = await pool(recent, 5, async ({ uri, story }) => {
    const page = await fetchText(story.url!, { maxBytes: 600_000, timeoutMs: 5000 })
    return headLinks(page.text).some((tag) => (tag.getAttribute('rel') ?? '').split(/\s+/).includes('site.standard.document') && tag.getAttribute('href') === uri) ? story : undefined
  })
  if (recent.length && verified.every((s) => !s)) throw new Error('Could not verify Standard.site articles')
  return verified.filter((s): s is Story => !!s)
}

/** Shared by the app and public mixes: cache verified articles, and charge only cold reads. */
export async function standardFeed(raw: string, label?: string, request?: Request): Promise<Story[]> {
  const url = canonical(await assertPublicUrl(raw))
  const stories = await cachedInKv(`rd:standard:${url}`, 900, async () => {
    // Metadata, three record pages, and four batches of article verification.
    if (request && (await fanOutLimited(request, 8))) throw new StandardRateLimit()
    return readStandardFeed(url)
  })
  return label ? stories.map((s) => ({ ...s, sourceLabel: label })) : stories
}
