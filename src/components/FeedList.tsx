import { X } from 'lucide-react'
import { usePrefs } from '../lib/store'
import type { CustomFeed } from '../lib/store'
import { byFolder } from '../lib/publishers'

/** The feeds you follow, in the folders they came in from another reader; ones followed here come first. */
export function FeedList() {
  const feeds = usePrefs((p) => p.customFeeds)
  const set = usePrefs((p) => p.set)
  const remove = (f: CustomFeed) => set({ customFeeds: usePrefs.getState().customFeeds.filter((x) => x.url !== f.url) })
  return (
    <div className="max-w-lg space-y-3">
      {byFolder(feeds).map((g) => (
        <section key={g.name || 'loose'}>
          {g.name && <h3 className="pt-1 text-[0.75rem] font-semibold tracking-wide text-ink-3 uppercase">{g.name}</h3>}
          <ul aria-label={g.name || 'Your feeds'}>
            {g.feeds.map((f) => (
              <li key={f.url} className="flex items-center gap-3 py-1">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-semibold">{f.label}</p>
                  <p className="truncate text-[0.8125rem] text-ink-3" title={f.url}>
                    {f.site ?? f.url.replace(/^https?:\/\/(www\.)?/, '')}
                  </p>
                </div>
                <button className="icon-btn flex-none" onClick={() => remove(f)} aria-label={`Remove ${f.label}`}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
