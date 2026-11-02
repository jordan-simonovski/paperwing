import { useQuery, type QueryClient } from '@tanstack/react-query'
import { canWrite, createRecord, deleteRecord, useAtproto } from './atproto'
import { keys } from './query'
import { NOTE_NSID } from './social'

// Margin notes: a passage of an article and what someone made of it, kept as a public record in
// their own Bluesky account (social.ts) and found by anyone reading the same article here
// (api/_lib/notes.ts). Bluesky stays where reputation lives; a note is just a note.

export interface NoteView {
  uri: string
  did: string
  handle?: string
  quote: string
  note: string
  createdAt: string
}

export const useMarginNotes = (url: string | null | undefined) =>
  useQuery({
    queryKey: keys.notes(url ?? ''),
    enabled: !!url,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/feed?src=notes&url=${encodeURIComponent(url!)}`)
      return res.ok ? ((await res.json()) as NoteView[]) : []
    },
  })

/** Text as it reads: one space between words, no edges. */
export const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()

export async function addNote(qc: QueryClient, url: string, quote: string, note: string): Promise<string> {
  const { did, scope } = useAtproto.getState()
  if (!did) throw new Error('Sign in with Bluesky to leave notes (Settings, Sources)')
  if (canWrite(scope, NOTE_NSID) === false) throw new Error('Notes need one more permission: allow it under Settings, Sources (Bluesky account).')
  const ref = await createRecord(NOTE_NSID, { url, quote: tidy(quote).slice(0, 600), note: note.trim().slice(0, 1000), createdAt: new Date().toISOString() })
  // Show it straight away; the index catches up in a moment.
  qc.setQueryData<NoteView[]>(keys.notes(url), (old = []) => [
    ...old,
    { uri: ref.uri, did, handle: useAtproto.getState().handle, quote: tidy(quote).slice(0, 600), note: note.trim(), createdAt: new Date().toISOString() },
  ])
  return ref.uri
}

export async function removeNote(qc: QueryClient, url: string, uri: string) {
  await deleteRecord(uri)
  qc.setQueryData<NoteView[]>(keys.notes(url), (old = []) => old.filter((n) => n.uri !== uri))
}

/**
 * Where a quote sits across a run of text pieces (an element's text nodes, in order), ignoring
 * differences in whitespace: an article's HTML breaks lines where the quote doesn't. Returns the piece
 * and offset where it starts and ends (end exclusive), or undefined when the passage isn't there.
 */
export function locateQuote(pieces: string[], quote: string): { start: [number, number]; end: [number, number] } | undefined {
  const starts: number[] = []
  let full = ''
  for (const p of pieces) {
    starts.push(full.length)
    full += p
  }
  // The text with whitespace runs collapsed, and where each of its characters came from.
  let norm = ''
  const from: number[] = []
  let space = false
  for (let i = 0; i < full.length; i++) {
    if (/\s/.test(full[i])) {
      if (!space && norm) {
        norm += ' '
        from.push(i)
      }
      space = true
    } else {
      norm += full[i]
      from.push(i)
      space = false
    }
  }
  const q = tidy(quote)
  const at = q ? norm.indexOf(q) : -1
  if (at < 0) return undefined
  const locate = (pos: number): [number, number] => {
    let i = starts.length - 1
    while (i > 0 && starts[i] > pos) i--
    return [i, pos - starts[i]]
  }
  const [ei, eo] = locate(from[at + q.length - 1])
  return { start: locate(from[at]), end: [ei, eo + 1] }
}

/** The DOM Range of a quote inside an element, for highlighting it. */
export function findQuote(container: Node, quote: string): Range | undefined {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)
  const spot = locateQuote(
    nodes.map((n) => n.data),
    quote,
  )
  if (!spot) return undefined
  const range = document.createRange()
  range.setStart(nodes[spot.start[0]], spot.start[1])
  range.setEnd(nodes[spot.end[0]], spot.end[1])
  return range
}
