import { History, PenLine } from 'lucide-react'
import { useState } from 'react'
import { ago, fullDate } from '../lib/format'
import { sanitize } from '../lib/html'
import { markdownHtml } from '../lib/markdown'
import type { SelfPostVersion } from '../lib/paperwing'
import { Sheet } from './Sheet'

const Words = ({ body }: { body: string }) => <div className="prose-c" dangerouslySetInnerHTML={{ __html: sanitize(markdownHtml(body)) }} />

/**
 * A self post's words in its thread. Once edited it says so; for a day after an edit, what it said
 * before can be read too. Its author can edit the words.
 */
export function SelfPostBody({
  body,
  versions,
  editedAt,
  onEdit,
  now = Date.now(),
}: {
  body: string
  versions: SelfPostVersion[]
  /** When it was last edited, if ever: known after the earlier versions are gone. */
  editedAt?: number
  onEdit?: () => void
  now?: number
}) {
  const [open, setOpen] = useState(false)
  const earlier = versions.length > 1
  const lastEdit = editedAt ?? (earlier ? versions.at(-1)!.seenAt : undefined)
  const edited = lastEdit !== undefined
  return (
    <>
      <Words body={body} />
      {(edited || onEdit) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {edited &&
            (earlier ? (
              <button type="button" className="btn h-8 px-3 text-[0.8125rem]" onClick={() => setOpen(true)} title={fullDate(lastEdit)}>
                <History size={14} /> Edited {ago(lastEdit, now)}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-[0.8125rem] text-ink-3" title={fullDate(lastEdit)}>
                <History size={14} /> Edited {ago(lastEdit, now)}
              </span>
            ))}
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
            <p className="text-[0.8125rem] text-ink-3">
              What it said before, for a day after each edit, newest first, with when PaperWing first saw each. Edits made within a minute of each other may show as one.
            </p>
            {[...versions].reverse().map((v, i) => (
              <section key={v.seenAt} className="rounded-xl bg-sunk p-4" aria-label={i === 0 ? 'Current version' : `Earlier version, from ${fullDate(v.seenAt)}`}>
                <p className="mb-2 text-[0.8125rem] font-semibold text-ink-3">
                  {i === 0 ? 'Now' : 'Before'}
                  <span className="ml-2 font-normal">{fullDate(v.seenAt)}</span>
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
