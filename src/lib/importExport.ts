import type { SavedItem } from './library'
import { linkKey, storyFromKey } from './sources'

/** One saved link from another app's export. */
export interface ImportedLink {
  url: string
  title?: string
  savedAt?: number
  archived?: boolean
  progress?: number
}

/** Minimal RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) rows.push([...row, field])
  return rows.filter((r) => r.some((f) => f.trim()))
}

/** Seconds or milliseconds since the epoch, or an ISO date. */
function toTime(v: string | number | undefined): number | undefined {
  if (v === undefined || v === '') return undefined
  const n = Number(v)
  if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n
  const t = Date.parse(String(v))
  return Number.isFinite(t) ? t : undefined
}

const isUrl = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//.test(u)

/** Pocket (CSV or the old HTML), Instapaper CSV, Omnivore JSON, PaperWing JSON, or any bookmarks HTML. */
export function parseImport(text: string): ImportedLink[] {
  const trimmed = text.trimStart()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const data = JSON.parse(trimmed) as unknown
    const list = (Array.isArray(data) ? data : ((data as { items?: unknown[] }).items ?? [])) as Record<string, unknown>[]
    return list
      .map((o) => {
        const story = o.story as Record<string, unknown> | undefined
        const url = (story?.url ?? o.url ?? o.originalUrl) as unknown
        if (!isUrl(url)) return undefined
        const state = String(o.state ?? o.status ?? '').toLowerCase()
        const progress = Number(o.progress ?? o.readingProgressPercent ?? o.readingProgress)
        return {
          url,
          title: (story?.title ?? o.title) as string | undefined,
          savedAt: toTime((o.savedAt ?? o.time_added) as string | number | undefined),
          archived: state === 'archive' || state === 'archived',
          progress: Number.isFinite(progress) ? (progress > 1 ? progress / 100 : progress) : undefined,
        }
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
  }

  if (/<a\s/i.test(text)) {
    const doc = new DOMParser().parseFromString(text, 'text/html')
    // Pocket's old HTML export lists the archive under a "Read Archive" heading.
    const archiveHeading = [...doc.querySelectorAll('h1, h2, h3')].find((h) => /read archive|archive/i.test(h.textContent ?? ''))
    return [...doc.querySelectorAll('a[href]')]
      .filter((a) => isUrl(a.getAttribute('href')))
      .map((a) => ({
        url: a.getAttribute('href')!,
        title: a.textContent?.trim() || undefined,
        savedAt: toTime(a.getAttribute('time_added') ?? a.getAttribute('add_date') ?? undefined),
        archived: !!archiveHeading && !!(archiveHeading.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING),
      }))
  }

  const [header, ...rows] = parseCsv(text)
  if (!header) return []
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h.trim().toLowerCase()))
  const url = col('url', 'link', 'href')
  if (url < 0) throw new Error('No URL column in this file')
  const title = col('title', 'name')
  const time = col('time_added', 'timestamp', 'saved_at', 'savedat', 'date')
  const status = col('status', 'folder', 'state')
  return rows
    .filter((r) => isUrl(r[url]))
    .map((r) => ({
      url: r[url],
      title: title >= 0 ? r[title] || undefined : undefined,
      savedAt: time >= 0 ? toTime(r[time]) : undefined,
      archived: status >= 0 ? /archive/i.test(r[status]) : false,
    }))
}

/** Saved items for links you don't already have, left hollow so they download in the background. */
export function toSavedItems(links: ImportedLink[], existing: Record<string, unknown>): SavedItem[] {
  const seen = new Set<string>()
  const out: SavedItem[] = []
  for (const l of links) {
    const key = linkKey(l.url)
    if (existing[key] || seen.has(key)) continue
    seen.add(key)
    const story = storyFromKey(key)!
    const savedAt = l.savedAt ?? Date.now()
    out.push({
      story: { ...story, title: l.title?.trim() || story.title, createdAt: savedAt },
      savedAt,
      state: l.archived ? 'archive' : 'queue',
      archivedAt: l.archived ? savedAt : undefined,
      progress: l.progress,
      hollow: true,
      updatedAt: Date.now(),
    })
  }
  return out
}

export function exportJson(items: SavedItem[]): string {
  return JSON.stringify(
    {
      readout: 1,
      exportedAt: new Date().toISOString(),
      // Articles and threads are left out: they re-download, and they'd make the file huge.
      items: items.map((i) => ({ ...i, article: undefined, thread: undefined })),
    },
    null,
    2,
  )
}

export function exportMarkdown(items: SavedItem[]): string {
  const line = (i: SavedItem) =>
    `- [${i.story.title.replace(/[[\]]/g, '')}](${i.story.url ?? i.story.discussionUrl ?? ''})${i.story.discussionUrl && i.story.url ? ` ([discussion](${i.story.discussionUrl}))` : ''}, saved ${new Date(i.savedAt).toISOString().slice(0, 10)}`
  const queue = items.filter((i) => (i.state ?? 'queue') === 'queue').sort((a, b) => b.savedAt - a.savedAt)
  const archive = items.filter((i) => i.state === 'archive').sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0))
  return `# PaperWing saved stories\n\n## Queue\n\n${queue.map(line).join('\n') || '_Empty_'}\n\n## Archive\n\n${archive.map(line).join('\n') || '_Empty_'}\n`
}

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
