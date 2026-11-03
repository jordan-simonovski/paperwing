import { Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { followsTech } from '../lib/channels'
import { plural } from '../lib/format'
import { download } from '../lib/importExport'
import { buildOpml, parseOpml, type OpmlSkipped } from '../lib/opml'
import { addFeeds, byFolder, MAX_FEEDS } from '../lib/publishers'
import { usePrefs } from '../lib/store'
import { TOPIC_BY_ID } from '../lib/topics'
import { toast } from '../lib/ui'

interface Imported extends OpmlSkipped {
  added: number
  folders: number
  already: number
  left: number
}

/** Moving feeds in and out with OPML, the format every feed reader speaks. */
export function OpmlTools() {
  const p = usePrefs()
  const input = useRef<HTMLInputElement>(null)
  const [imported, setImported] = useState<Imported>()
  const importFile = async (file: File) => {
    const { feeds: found, skipped } = parseOpml(await file.text())
    if (!found.length && !skipped.unreadable && !skipped.private) return toast('No feeds found in that file', { tone: 'error' })
    const { customFeeds, set } = usePrefs.getState()
    const { feeds, added, left } = addFeeds(customFeeds, found)
    set({ customFeeds: feeds })
    setImported({ ...skipped, added: added.length, folders: new Set(added.flatMap((f) => f.folder ?? [])).size, already: found.length - added.length - left, left })
  }
  const exportFile = () => {
    const topicFeeds = p.followed.flatMap((id) => {
      const t = TOPIC_BY_ID.get(id)
      const feeds = (t?.feeds ?? []).flatMap((f) => (f.kind === 'rss' ? [{ url: f.url, label: f.label }] : []))
      return t && feeds.length ? [{ name: t.label, feeds }] : []
    })
    download('paperwing-feeds.opml', buildOpml('PaperWing feeds', [...byFolder(p.customFeeds), ...topicFeeds]), 'text/x-opml')
  }
  return (
    <div className="space-y-2 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept=".opml,.xml,text/xml,text/x-opml"
          className="hidden"
          aria-label="Choose an OPML file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importFile(file)
            e.target.value = ''
          }}
        />
        <button className="btn h-9 text-[0.8125rem]" onClick={() => input.current?.click()}>
          <Upload size={14} /> Import OPML
        </button>
        <button className="btn h-9 text-[0.8125rem]" onClick={exportFile}>
          <Download size={14} /> Export OPML
        </button>
        <span className="text-[0.8125rem] text-ink-3">Bring feeds from another reader, like FreshRSS, with their folders, or take yours (and your topics’ publishers) anywhere.</span>
      </div>
      {imported && <ImportSummary {...imported} where={followsTech(p.followed) ? 'Blogs' : 'Publishers'} />}
    </div>
  )
}

/** What an import did, kept on screen: a big file can leave out enough to want to read about. */
function ImportSummary({ added, folders, already, left, unreadable, private: secret, where }: Imported & { where: string }) {
  const lines = [
    added
      ? `Following ${plural(added, 'new feed')}${folders ? `, in ${plural(folders, 'folder')}` : ''}. They’re in ${where}.`
      : already
        ? 'You already follow all of those.'
        : 'Nothing new to follow.',
    added && already ? `You already followed ${already}.` : '',
    left ? `${left} left out: you follow ${MAX_FEEDS} feeds, as many as PaperWing keeps. Unfollow some below to make room.` : '',
    unreadable ? `${unreadable} skipped: PaperWing reads RSS and Atom feeds, not scraped pages or JSON feeds.` : '',
    secret
      ? `${secret} skipped: ${secret === 1 ? 'its address holds' : 'their addresses hold'} a password or token, which PaperWing would sync. Add ${secret === 1 ? 'it' : 'them'} by hand if you’re happy with that.`
      : '',
  ].filter(Boolean)
  return (
    <div role="status" className="max-w-lg space-y-1 rounded-xl bg-sunk px-3.5 py-2.5 text-[0.8125rem] text-ink-2">
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </div>
  )
}
