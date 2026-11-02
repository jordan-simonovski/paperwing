// Rich text for a Bluesky post: links, @mentions and #tags, marked by their UTF-8 byte ranges the
// way the app.bsky.richtext.facet lexicon wants. Mentions are resolved to DIDs through Bluesky's
// public API; one that doesn't resolve is left as plain text.

export interface Facet {
  index: { byteStart: number; byteEnd: number }
  features: ({ $type: 'app.bsky.richtext.facet#link'; uri: string } | { $type: 'app.bsky.richtext.facet#mention'; did: string } | { $type: 'app.bsky.richtext.facet#tag'; tag: string })[]
}

const encoder = new TextEncoder()
const bytes = (text: string, i: number) => encoder.encode(text.slice(0, i)).length

/** Links (with or without https://, trailing punctuation left out), @handles and #tags, with their byte ranges. */
export function findFacets(text: string): { kind: 'link' | 'mention' | 'tag'; value: string; start: number; end: number }[] {
  const out: { kind: 'link' | 'mention' | 'tag'; value: string; start: number; end: number }[] = []
  const add = (kind: 'link' | 'mention' | 'tag', value: string, from: number, to: number) => out.push({ kind, value, start: bytes(text, from), end: bytes(text, to) })
  for (const m of text.matchAll(/(^|[\s(])((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi)) {
    let link = m[2].replace(/[.,;:!?)\]'"]+$/, '')
    // Bare words with a dot ("e.g", "file.ts") aren't links; a scheme or a path makes it one.
    if (!/^https?:\/\//i.test(link) && !/\.(com|org|net|dev|io|app|ai|co|so|sh|xyz|me|blog|news|social)(\/|$)/i.test(link)) continue
    const from = m.index! + m[1].length
    if (!/^https?:\/\//i.test(link)) link = `https://${link}`
    add('link', link, from, from + m[2].replace(/[.,;:!?)\]'"]+$/, '').length)
  }
  for (const m of text.matchAll(/(^|[\s(])@((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*)/gi)) {
    const from = m.index! + m[1].length
    add('mention', m[2].toLowerCase(), from, from + m[2].length + 1)
  }
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)/gu)) {
    const from = m.index! + m[1].length
    add('tag', m[2], from, from + m[2].length + 1)
  }
  return out.sort((a, b) => a.start - b.start)
}

export async function facetsFor(text: string): Promise<Facet[]> {
  const found = findFacets(text)
  const out: Facet[] = []
  for (const f of found) {
    if (f.kind === 'link') out.push({ index: { byteStart: f.start, byteEnd: f.end }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: f.value }] })
    else if (f.kind === 'tag') out.push({ index: { byteStart: f.start, byteEnd: f.end }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: f.value }] })
    else {
      try {
        const res = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(f.value)}`)
        const did = res.ok ? ((await res.json()) as { did?: string }).did : undefined
        if (did) out.push({ index: { byteStart: f.start, byteEnd: f.end }, features: [{ $type: 'app.bsky.richtext.facet#mention', did }] })
      } catch {
        /* left as text */
      }
    }
  }
  return out
}

/** What Bluesky counts against its 300 limit: graphemes, so an emoji is one. */
export function graphemes(text: string): number {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) return [...new Intl.Segmenter().segment(text)].length
  return [...text].length
}
