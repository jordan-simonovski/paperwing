import { Loader2, X } from 'lucide-react'
import { useState } from 'react'
import { findLabeler, withSetting, type LabelSetting } from '../lib/moderation'
import { usePrefs } from '../lib/store'
import { toast } from '../lib/ui'

const SETTINGS: [LabelSetting, string][] = [
  ['hide', 'Hide'],
  ['warn', 'Warn'],
  ['ignore', 'Show'],
]

/** Settings: subscribe to Bluesky labelers, and choose what each of their labels does. */
export function Labelers() {
  const { labelers, set } = usePrefs()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string>()
  return (
    <div className="space-y-3">
      {labelers.map((l) => (
        <div key={l.did} className="rounded-xl bg-sunk px-4 py-3">
          <div className="flex items-center gap-3">
            <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === l.did ? undefined : l.did)} aria-expanded={open === l.did}>
              <p className="truncate text-[0.9375rem] font-semibold">{l.name}</p>
              <p className="truncate text-[0.8125rem] text-ink-3">
                {l.handle ? `@${l.handle} · ` : ''}
                {Object.keys(l.defs).length} labels · {open === l.did ? 'hide settings' : 'choose what they do'}
              </p>
            </button>
            <button className="icon-btn flex-none" onClick={() => set({ labelers: labelers.filter((x) => x.did !== l.did) })} aria-label={`Unsubscribe from ${l.name}`}>
              <X size={14} />
            </button>
          </div>
          {open === l.did && (
            <div className="mt-3 space-y-2">
              {Object.entries(l.defs).map(([val, d]) => (
                <div key={val} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 text-[0.875rem]">{d.name}</span>
                  <div className="seg" role="radiogroup" aria-label={d.name}>
                    {SETTINGS.map(([v, label]) => (
                      <button
                        key={v}
                        role="radio"
                        aria-checked={d.setting === v}
                        aria-pressed={d.setting === v}
                        onClick={() => set({ labelers: labelers.map((x) => (x.did === l.did ? withSetting(x, val, v) : x)) })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <form
        className="flex max-w-lg gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          setBusy(true)
          findLabeler(draft)
            .then((l) => {
              if (!usePrefs.getState().labelers.some((x) => x.did === l.did)) set({ labelers: [...usePrefs.getState().labelers, l] })
              setDraft('')
              toast(`Subscribed to ${l.name}`)
            })
            .catch((err: Error) => toast(err.message, { tone: 'error' }))
            .finally(() => setBusy(false))
        }}
      >
        <input
          className="input"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="A labeler’s handle or bsky.app link"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Labeler"
        />
        <button className="btn h-10 flex-none" disabled={busy}>
          {busy && <Loader2 size={14} className="spin" />} Subscribe
        </button>
      </form>
    </div>
  )
}
