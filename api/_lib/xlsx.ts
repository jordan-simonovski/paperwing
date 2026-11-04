import { inflateRawSync } from 'node:zlib'
import { decodeEntities } from './http.js'

// Just enough of .xlsx to read the tables states publish their WARN notices in: unzip, find the
// sheets, and read each row's cell values. An .xlsx is a zip of XML files; shared strings live in
// one of them and cells point at them by index. No styles, formulas or dates: a date arrives as
// Excel's day number, and excelDate() turns it into one when the caller knows the column holds dates.

export type Cell = string | number | undefined
export type Row = Cell[]

const LIMIT = 80_000_000 // inflated bytes, across the files read: IL's export is 1 MB zipped, about 15 MB of XML

/** The files in a zip, by name, inflated on demand. */
function unzip(buf: Uint8Array): Map<string, () => Buffer> {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
  // The end-of-central-directory record sits in the last 64 KB (after an optional comment).
  let eocd = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--)
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  if (eocd < 0) throw new Error('Not an .xlsx file')
  const count = b.readUInt16LE(eocd + 10)
  let at = b.readUInt32LE(eocd + 16)
  const files = new Map<string, () => Buffer>()
  for (let n = 0; n < count; n++) {
    if (b.readUInt32LE(at) !== 0x02014b50) throw new Error('Broken .xlsx file')
    const method = b.readUInt16LE(at + 10)
    const size = b.readUInt32LE(at + 20)
    const nameLength = b.readUInt16LE(at + 28)
    const extra = b.readUInt16LE(at + 30)
    const comment = b.readUInt16LE(at + 32)
    const local = b.readUInt32LE(at + 42)
    const name = b.toString('utf8', at + 46, at + 46 + nameLength)
    files.set(name, () => {
      const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28)
      const data = b.subarray(start, start + size)
      if (method === 0) return data
      if (method === 8) return inflateRawSync(data, { maxOutputLength: LIMIT })
      throw new Error('Unsupported .xlsx compression')
    })
    at += 46 + nameLength + extra + comment
  }
  return files
}

// Some writers prefix every element with a namespace (<x:row>), so tags are matched with or without one.
const text = (xml: string) => decodeEntities([...xml.matchAll(/<(?:\w+:)?t\b[^>]*>([^<]*)<\/(?:\w+:)?t>/g)].map((m) => m[1]).join(''))

/** "B12" is column 1; "AA3" is column 26. */
function column(ref: string): number {
  let n = 0
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

function rows(xml: string, strings: string[]): Row[] {
  const out: Row[] = []
  for (const row of xml.matchAll(/<(?:\w+:)?row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const cells: Row = []
    for (const c of (row[1] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const attrs = c[1]
      const body = c[2] ?? ''
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1]
      const type = /\bt="(\w+)"/.exec(attrs)?.[1]
      const v = /<(?:\w+:)?v>([^<]*)<\/(?:\w+:)?v>/.exec(body)?.[1]
      const at = ref ? column(ref) : cells.length
      let value: Cell
      if (type === 's') value = v === undefined ? undefined : strings[Number(v)]
      else if (type === 'inlineStr') value = text(body)
      else if (type === 'str' || type === 'e') value = v === undefined ? undefined : decodeEntities(v)
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE'
      else value = v === undefined || v === '' ? undefined : Number(v)
      cells[at] = typeof value === 'string' ? value.trim() || undefined : value
    }
    out.push(cells)
  }
  return out
}

/** Every sheet in a workbook, in order, as rows of cell values. */
export function readXlsx(bytes: Uint8Array): { name: string; rows: Row[] }[] {
  const files = unzip(bytes)
  const read = (name: string) => files.get(name)?.().toString('utf8')
  const shared = read('xl/sharedStrings.xml')
  const strings = shared ? [...shared.matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => text(m[1]).trim()) : []
  const book = read('xl/workbook.xml') ?? ''
  const rels = read('xl/_rels/workbook.xml.rels') ?? ''
  const target = new Map([...rels.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)].map((m) => [/\bId="([^"]+)"/.exec(m[0])?.[1], /\bTarget="([^"]+)"/.exec(m[0])?.[1]]))
  return [...book.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)].flatMap((m) => {
    const name = decodeEntities(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? '')
    const id = /\br:id="([^"]+)"/.exec(m[0])?.[1]
    const path = target.get(id)?.replace(/^\/?(xl\/)?/, 'xl/')
    const xml = path ? read(path) : undefined
    return xml ? [{ name, rows: rows(xml, strings) }] : []
  })
}

/** Excel's day number (days since 30 December 1899) as an ISO date. */
export function excelDate(n: number): string | undefined {
  if (!Number.isFinite(n) || n < 20_000 || n > 80_000) return undefined
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86_400_000).toISOString().slice(0, 10)
}
