import { BadgeCheck } from 'lucide-react'

/**
 * Marks a board PaperWing itself runs (its owner is PaperWing's own account; see boardFinder.ts).
 * Decided by the server from who owns the board, so no board can give itself one.
 */
export function OfficialBadge({ size = 14, label = false }: { size?: number; label?: boolean }) {
  return (
    <span className="official-badge" role="img" aria-label="Official PaperWing board" title="Official: run by PaperWing">
      <BadgeCheck size={size} aria-hidden />
      {label && <span aria-hidden>Official</span>}
    </span>
  )
}
