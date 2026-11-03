import { ChevronDown, Globe } from 'lucide-react'
import { useState } from 'react'
import { timeAgo } from '../lib/format'
import { useWebmentions } from '../lib/webmentions'

/** Blogs and personal sites replying to or mentioning the article (webmentions), when there are any. */
export function WebMentions({ url, now }: { url: string | null | undefined; now: number }) {
  const { data } = useWebmentions(url)
  const [open, setOpen] = useState(false)
  if (!data?.length) return null
  const talk = data.filter((m) => m.kind === 'reply' || m.kind === 'mention')
  const nods = data.length - talk.length
  const summary = [talk.length ? `${talk.length} ${talk.length === 1 ? 'post' : 'posts'} about it` : '', nods ? `${nods} ${nods === 1 ? 'like or repost' : 'likes and reposts'}` : '']
    .filter(Boolean)
    .join(', ')
  return (
    <section className="mt-3 rounded-2xl bg-sunk">
      <button className="flex w-full items-center gap-2.5 px-4 py-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open} disabled={!talk.length}>
        <Globe size={16} className="flex-none text-ink-3" />
        <span className="min-w-0 flex-1 text-[0.875rem]">
          <span className="font-semibold">Around the web</span> <span className="ml-2 text-ink-3">{summary}, from personal sites</span>
        </span>
        {talk.length > 0 && <ChevronDown size={16} className={`flex-none text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open && (
        <ul className="space-y-3 px-4 pb-4">
          {talk.slice(0, 20).map((m) => (
            <li key={m.id} className="flex gap-2.5">
              {m.photo ? (
                <img src={m.photo} alt="" referrerPolicy="no-referrer" loading="lazy" className="mt-0.5 size-6 flex-none rounded-full object-cover" />
              ) : (
                <span className="mt-0.5 grid size-6 flex-none place-items-center rounded-full bg-panel text-[0.6875rem] font-bold">{m.author[0]?.toUpperCase()}</span>
              )}
              <div className="min-w-0 flex-1 text-[0.875rem]">
                <p className="text-ink-3">
                  <a className="font-semibold text-ink-2 hover:text-ink" href={m.authorUrl ?? m.url} target="_blank" rel="noopener noreferrer">
                    {m.author}
                  </a>{' '}
                  {m.kind === 'reply' ? 'replied' : 'wrote about it'}
                  {m.at ? <span className="ml-2 text-ink-3">{timeAgo(m.at, now)}</span> : null}
                </p>
                {m.text && <p className="mt-0.5 leading-snug text-ink-2">{m.text}</p>}
                <a className="mt-0.5 inline-block text-[0.8125rem] text-ink-3 underline underline-offset-2" href={m.url} target="_blank" rel="noopener noreferrer">
                  Read it on their site
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
