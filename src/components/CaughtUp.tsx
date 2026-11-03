import { Check } from 'lucide-react'

/** Where Hot turns to what you've seen on earlier visits: everything above it is new to you. */
export function CaughtUp() {
  return (
    <div role="separator" aria-label="You’re caught up" className="flex items-center gap-3 px-4 py-4 text-[0.8125rem] text-ink-3 sm:px-6">
      <span className="h-px flex-1 bg-line" />
      <span className="flex items-center gap-1.5 font-semibold text-ink-2">
        <Check size={14} aria-hidden /> You’re caught up
      </span>
      <span className="hidden sm:inline">Below: mostly what you’ve seen</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}
