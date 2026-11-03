import { Check, Layers, Plus } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { mixChannel, newMix, saveMix, sameSource, toggleInMix } from '../lib/mixes'
import type { MixSource } from '../lib/mixSources'
import { usePrefs } from '../lib/store'
import { toast } from '../lib/ui'
import { Sheet } from './Sheet'

/**
 * "Add to mix", next to Follow wherever something can be followed: a blog, a topic, a community, a
 * Bluesky feed. Opens a short sheet of your mixes (ticked where it's already in) and a way to start a
 * new one around it, so building a mix happens while reading, not in a separate editor.
 */
export function AddToMix({
  source,
  label,
  className = 'pill h-7 px-2.5 text-[0.8125rem]',
  iconOnly = false,
  textClassName = '',
}: {
  source: MixSource
  label: string
  className?: string
  iconOnly?: boolean
  /** Classes for the button's words, to hide them on narrow screens. */
  textClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const inSome = usePrefs((p) => p.mixes.some((m) => m.sources.some((s) => sameSource(s, source))))
  return (
    <>
      <button
        className={className}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        title={`Add ${label} to a mix`}
        aria-label={iconOnly ? `Add ${label} to a mix` : `${inSome ? 'In a mix' : 'Add to mix'}: ${label}`}
      >
        <Layers size={13} />
        {!iconOnly && <span className={textClassName}>{inSome ? 'In a mix' : 'Add to mix'}</span>}
      </button>
      {/* At the top of the page: a coloured header must neither tint it nor trap it under the bottom bar. */}
      {open && createPortal(<MixPicker source={source} label={label} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

function MixPicker({ source, label, onClose }: { source: MixSource; label: string; onClose: () => void }) {
  const mixes = usePrefs((p) => p.mixes)
  const navigate = useNavigate()
  const toggle = (id: string) => {
    const mix = usePrefs.getState().mixes.find((m) => m.id === id)
    if (!mix) return
    const { added, republish } = toggleInMix(mix, source)
    toast(added ? `Added to ${mix.name || 'your mix'}` : `Taken out of ${mix.name || 'your mix'}`)
    republish?.catch((err: Error) => toast(`Saved here, but couldn’t update the published mix: ${err.message}`, { tone: 'error' }))
  }
  const start = () => {
    const mix = saveMix({ ...newMix(label), sources: [source] })
    onClose()
    navigate(`/mixes/${mix.id}`)
  }
  return (
    <Sheet open onClose={onClose} side="bottom" label="Add to mix">
      <div className="p-4">
        <h2 className="flex items-center gap-2 text-[1.0625rem] font-bold">
          <Layers size={17} /> Add to a mix
        </h2>
        <p className="mt-0.5 text-[0.875rem] text-ink-3">
          Put <span className="font-semibold text-ink-2">{label}</span> in one of your mixes, or start a new one. A mix is your own channel, made from any blogs, topics, communities and feeds.
        </p>
        <div className="mt-3 space-y-1.5">
          {mixes.map((m) => {
            const has = m.sources.some((s) => sameSource(s, source))
            return (
              <div key={m.id} className="flex items-center gap-1.5">
                <button className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-sunk px-3.5 py-3 text-left hover:bg-line" onClick={() => toggle(m.id)} aria-pressed={has}>
                  <span className={`grid size-6 flex-none place-items-center rounded-full ${has ? 'bg-ink text-ground' : 'border border-line'}`}>{has && <Check size={14} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-semibold">{m.name || 'Untitled mix'}</span>
                    <span className="meta">
                      <span>
                        {m.sources.length} {m.sources.length === 1 ? 'source' : 'sources'}
                      </span>
                      {m.published && <span>published</span>}
                    </span>
                  </span>
                </button>
                <button
                  className="btn h-auto flex-none self-stretch rounded-xl px-3.5 text-[0.8125rem]"
                  onClick={() => {
                    onClose()
                    navigate(`/t/${mixChannel(m)}`)
                  }}
                >
                  Open
                </button>
              </div>
            )
          })}
          <button className="flex w-full items-center gap-3 rounded-xl border border-dashed border-line px-3.5 py-3 text-left hover:bg-sunk" onClick={start}>
            <span className="grid size-6 flex-none place-items-center rounded-full bg-sunk">
              <Plus size={14} />
            </span>
            <span className="text-[0.9375rem] font-semibold">New mix with {label}</span>
          </button>
        </div>
      </div>
    </Sheet>
  )
}
