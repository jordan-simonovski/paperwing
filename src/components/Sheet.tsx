import { useEffect, useRef } from 'react'
import { pretextOn } from '../lib/pretext'

interface Props {
  open: boolean
  onClose: () => void
  /** A drawer from the left edge, or a sheet up from the bottom. */
  side: 'left' | 'bottom'
  label: string
  children: React.ReactNode
}

function dealFrom(opener: HTMLElement, panel: HTMLElement) {
  const o = opener.getBoundingClientRect()
  const ox = o.left + o.width / 2
  const oy = o.top + o.height / 2
  const items = [...panel.querySelectorAll<HTMLElement>('a, button, h2, h3, .label')].filter((el) => !el.parentElement?.closest('a, button')).slice(0, 40)
  items.forEach((el, i) => {
    const r = el.getBoundingClientRect()
    if (!r.width) return
    el.animate(
      [
        { transform: `translate(${ox - (r.left + r.width / 2)}px, ${oy - (r.top + r.height / 2)}px) scale(0.3)`, opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 420, delay: i * 16, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'backwards' },
    )
  })
}

/** A panel over the page, for phones: tap outside, press Escape or follow a link inside to close. */
export function Sheet({ open, onClose, side, label, children }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  // Owners often pass a new onClose on every render; the panel opens once per open, not per render
  // (re-running would take focus back from whatever you're typing in).
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!open) return
    // Pretext motion: the panel's items deal out of the button that opened it.
    const opener = document.activeElement
    if (pretextOn() && opener instanceof HTMLElement && panel.current && !panel.current.contains(opener)) dealFrom(opener, panel.current)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', onKey)
    // The page underneath shouldn't scroll along with the panel.
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = 'hidden'
    panel.current?.focus({ preventScroll: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      root.style.overflow = before
    }
  }, [open])

  return (
    <div className={`sheet-root sheet-${side}${open ? ' open' : ''}`} inert={!open}>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        // Following a link inside means you're done here.
        onClick={(e) => (e.target as Element).closest('a') && onClose()}
      >
        {children}
      </div>
    </div>
  )
}
