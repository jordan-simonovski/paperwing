import { describe, expect, it } from 'vitest'
import { exportMarkdown, parseImport, toSavedItems } from './importExport'

describe('parseImport', () => {
  it('reads a Pocket CSV export, archive status and all', () => {
    const csv = 'title,url,time_added,tags,status\n"Hello, world",https://a.dev/x,1700000000,,unread\nDone,https://b.dev/y,1700000100,go,archive\n'
    expect(parseImport(csv)).toEqual([
      { url: 'https://a.dev/x', title: 'Hello, world', savedAt: 1700000000000, archived: false },
      { url: 'https://b.dev/y', title: 'Done', savedAt: 1700000100000, archived: true },
    ])
  })
  it('reads Instapaper CSV with quoted newlines', () => {
    const csv = 'URL,Title,Selection,Folder,Timestamp\nhttps://c.dev,"Two\nlines",,Archive,1700000200\n'
    expect(parseImport(csv)[0]).toMatchObject({ url: 'https://c.dev', title: 'Two\nlines', archived: true })
  })
  it('reads Omnivore JSON', () => {
    const json = JSON.stringify([{ url: 'https://d.dev', title: 'D', state: 'Archived', savedAt: '2025-01-02T00:00:00Z', readingProgress: 50 }])
    expect(parseImport(json)[0]).toMatchObject({ url: 'https://d.dev', archived: true, progress: 0.5, savedAt: Date.parse('2025-01-02T00:00:00Z') })
  })
  it('rejects a CSV without a URL column', () => {
    expect(() => parseImport('name,when\nx,1\n')).toThrow(/URL column/)
  })
})

describe('toSavedItems', () => {
  it('skips links already saved or repeated, and leaves the rest to download later', () => {
    const items = toSavedItems([{ url: 'https://a.dev' }, { url: 'https://a.dev' }, { url: 'https://b.dev', archived: true }], {})
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ hollow: true, state: 'queue' })
    expect(items[1].state).toBe('archive')
    expect(toSavedItems([{ url: 'https://a.dev' }], { [items[0].story.key]: true })).toHaveLength(0)
    expect(exportMarkdown(items)).toContain('## Archive')
  })
})
