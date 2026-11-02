import { useEffect, useState } from 'react'
import { describeSpice, useSpice, wantSpice } from '../lib/spice'
import type { SpiceLevel } from '../lib/spiceTypes'
import { usePrefs } from '../lib/store'
import type { Story } from '../lib/types'

type Places = Pick<Story, 'key' | 'source' | 'comments'>[]

/** One chilli, in the brand red with an ink stem. */
function Chilli() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className="block">
      <path d="M9.4 4.7c2.4-.1 3.9 1.8 3.3 4.4-.8 3.4-4.8 5.7-9.9 5.6-.6 0-.8-.7-.2-.9 3.2-1.2 4.5-3.4 4.6-6.3.1-1.7.9-2.7 2.2-2.8Z" fill="var(--signal)" />
      <path d="M8.3 5.6c.7-1 2.3-1.5 3.8-.8M10.4 4.7c.1-1.3-.3-2.3-1.2-3" fill="none" stroke="var(--ink-2)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function Chillies({ level }: { level: SpiceLevel }) {
  return (
    <span className="inline-flex items-center -space-x-0.5">
      {Array.from({ length: level }, (_, i) => (
        <Chilli key={i} />
      ))}
    </span>
  )
}

function useGrade(places: Places) {
  const on = usePrefs((p) => p.spice)
  useEffect(() => {
    if (on) for (const p of places) wantSpice(p)
  })
  const grade = useSpice(places)
  return on ? grade : undefined
}

/** On a row: the chillies, or nothing for a calm discussion. */
export function SpiceMark({ places }: { places: Places }) {
  const g = useGrade(places)
  if (!g?.level) return null
  const { name, reasons } = describeSpice(g)
  const label = `${name} discussion${reasons.length ? `: ${reasons.join(', ')}` : ''}`
  return (
    <span className="spice" title={label} aria-label={label} role="img">
      <Chillies level={g.level} />
    </span>
  )
}

/** In the reader: the chillies with their name; tapping says what makes it so. */
export function SpiceDetail({ places }: { places: Places }) {
  const g = useGrade(places)
  const [open, setOpen] = useState(false)
  if (!g?.level) return null
  const { name, reasons } = describeSpice(g)
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <button className="pill" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="How heated the discussion is">
        <Chillies level={g.level} />
        <span>{name}</span>
      </button>
      {open && (
        <span className="text-[0.8125rem] text-ink-2">
          {reasons.length ? `${reasons.join(', ').replace(/^./, (c) => c.toUpperCase())}.` : 'People disagree, but nothing stands out.'} Graded by Jev from the top comments.
        </span>
      )}
    </span>
  )
}
