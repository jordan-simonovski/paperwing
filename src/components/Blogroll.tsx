import { BookOpen, Check, ChevronDown, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FEEDS_FULL, feedRoom, follow } from '../lib/follow'
import { plural } from '../lib/format'
import { usePrefs } from '../lib/store'
import { toast } from '../lib/ui'
import { AddToMix } from './AddToMix'
import { addFeeds, publisherRef, type PublisherFeed } from '../lib/publishers'

type Feed = PublisherFeed

/** Someone's blogroll on their profile: the blogs they read, each one to follow or mix, or all at once. */
export function Blogroll({ feeds, who, mine }: { feeds: Feed[]; who: string; mine: boolean }) {
  const [open, setOpen] = useState(false)
  // Select the stored array (a stable value) and derive from it: a selector building a new Set each time re-renders forever.
  const customFeeds = usePrefs((p) => p.customFeeds)
  const followed = useMemo(() => new Set(customFeeds.map((f) => f.url)), [customFeeds])
  const missing = feeds.filter((f) => !followed.has(f.url))
  const followAll = () => {
    const { customFeeds, set } = usePrefs.getState()
    const { feeds, added, left } = addFeeds(customFeeds, missing, feedRoom())
    if (!added.length) return toast(FEEDS_FULL, { tone: 'error' })
    set({ customFeeds: feeds })
    toast(`Following ${plural(added.length, 'blog')} from ${who}’s blogroll${left ? `, ${left} left out: your feeds are full` : ''}`, {
      action: { label: 'Undo', run: () => usePrefs.getState().set({ customFeeds: usePrefs.getState().customFeeds.filter((f) => !added.some((m) => m.url === f.url)) }) },
    })
  }
  return (
    <div className="mt-4">
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <BookOpen size={15} className="flex-none text-ink-3" />
        <span className="flex-1 text-[0.8125rem] font-semibold text-ink-3">
          {mine ? 'Your blogroll' : 'Blogroll'} · {plural(feeds.length, 'blog')}
          {!mine && missing.length < feeds.length ? `, ${feeds.length - missing.length} you follow` : ''}
        </span>
        <ChevronDown size={15} className={`flex-none text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {!mine && missing.length > 1 && (
            <button className="btn btn-primary mb-1 h-9 text-[0.8125rem]" onClick={followAll}>
              <Plus size={14} /> Follow all {missing.length}
            </button>
          )}
          {feeds.map((f) => {
            const has = followed.has(f.url)
            return (
              <div key={f.url} className="flex items-center gap-2 rounded-xl bg-sunk px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-semibold">{f.label}</p>
                  {f.site && <p className="truncate text-[0.8125rem] text-ink-3">{f.site}</p>}
                </div>
                <AddToMix source={publisherRef(f)} label={f.label} iconOnly className="icon-btn size-8 flex-none" />
                <button
                  className={`btn h-8 flex-none px-3 text-[0.8125rem] ${has ? '' : 'btn-primary'}`}
                  disabled={has}
                  onClick={() => follow({ url: f.url, title: f.label, site: f.site ?? '', posts: 0, format: f.format })}
                >
                  {has ? <Check size={14} /> : <Plus size={14} />} {has ? 'Following' : 'Follow'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
