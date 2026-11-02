import { cleanNote, NOTE_NSID } from '../../src/lib/social.js'
import { linking, variants } from './atlinks.js'
import { getRecord, handles, pool } from './frontpage.js'

// Margin notes on an article: io.paperwing.note records anywhere on the network pointing at its URL,
// found through Constellation (the public index of links between atproto records) and read from each
// author's own repo. No database: a note exists as long as its author keeps it.

export interface NoteView {
  uri: string
  did: string
  handle?: string
  quote: string
  note: string
  createdAt: string
}

export async function marginNotes(url: string): Promise<NoteView[]> {
  if (!/^https?:\/\/\S{4,2000}$/.test(url)) throw new Error('url must be an http(s) link')
  const uris = new Set<string>()
  for (const target of variants(url)) for (const u of await linking(target, NOTE_NSID, '.url', 100).catch(() => [])) uris.add(u)
  const records = await pool([...uris].slice(0, 100), 10, (u) => getRecord<unknown>(u).catch(() => undefined))
  const notes = records.flatMap((r) => {
    const n = r ? cleanNote(r.value) : undefined
    // A note counts for the article it names, not just any link Constellation matched.
    return r && n && variants(url).includes(n.url) ? [{ uri: r.uri, did: r.uri.split('/')[2], quote: n.quote, note: n.note, createdAt: n.createdAt }] : []
  })
  const names = await handles(notes.map((n) => n.did))
  return notes.map((n) => ({ ...n, handle: names.get(n.did) })).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
}
