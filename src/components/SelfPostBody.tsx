import { History, PenLine } from 'lucide-react'
import { useState } from 'react'
import { ago, fullDate } from '../lib/format'
import { sanitize } from '../lib/html'
import { markdownHtml } from '../lib/markdown'
import type { SelfPostVersion } from '../lib/paperwing'
import { Sheet } from './Sheet'

const Words = ({ body }: { body: string }) => <div className="prose-c" dangerouslySetInnerHTML={{ __html: sanitize(markdownHtml(body)) }} />

/**
 * A self post's words in its thread. Once edited it says so, and every version PaperWing has seen
 * can be read, with when it first saw each. Its author can edit the words.
 */
export function SelfPostBody({ body, versions, onEdit, now = Date.now() }: { body: string; versions: SelfPostVersion[]; onEdit?: () => void; now?: number }) {
  const [open, setOpen] = useState(false)
  const edited = versions.length > 1
  return (
    <>
      <Words body={body} />
      {(edited || onEdit) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {edited && (
            <button type="button" className="btn h-8 px-3 text-[0.8125rem]" onClick={() => setOpen(true)} title={fullDate(versions.at(-1)!.seenAt)}>
              <History size={14} /> Edited {ago(versions.at(-1)!.seenAt, now)}
            </button>
          )}
          {onEdit && (
            <button type="button" className="btn h-8 px-3 text-[0.8125rem]" onClick={onEdit}>
              <PenLine size={14} /> Edit
            </button>
          )}
        </div>
      )}
      {open && (
        <Sheet open onClose={() => setOpen(false)} side="bottom" label="Versions">
          <div className="space-y-4 p-4">
            <h2 className="text-[1.0625rem] font-bold">Versions</h2>
            <p className="text-[0.8125rem] text-ink-3">Every version PaperWing has seen, newest first, with when it first saw it. Edits made in quick succession may show as one.</p>
            {[...versions].reverse().map((v, i) => (
              <section
                key={v.seenAt}
                className="rounded-xl bg-sunk p-4"
                aria-label={i === 0 ? 'Current version' : i === versions.length - 1 ? 'Original version' : `Version from ${fullDate(v.seenAt)}`}
              >
                <p className="mb-2 text-[0.8125rem] font-semibold text-ink-3">
                  {i === 0 ? 'Now' : i === versions.length - 1 ? 'Original' : 'Earlier'} · {fullDate(v.seenAt)}
                </p>
                <Words body={v.body} />
              </section>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}
