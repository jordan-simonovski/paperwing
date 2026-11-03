import { usePrefs } from '../lib/store'

// What For you shows from PaperWing's community: suggestions from boards you haven't joined, and
// PaperWing's own announcements. Both on to start with; both yours to turn off. They sync.

function Option({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" className="mt-0.5 h-[1.125rem] w-[1.125rem] flex-none accent-[var(--ink)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-[0.9375rem] text-ink-2">{label}</span>
        <span className="block text-[0.8125rem] text-ink-3">{hint}</span>
      </span>
    </label>
  )
}

/** Settings: board suggestions and announcements in For you. */
export function BoardSettings() {
  const boardPicks = usePrefs((p) => p.boardPicks)
  const announcements = usePrefs((p) => p.announcements)
  const set = usePrefs((p) => p.set)
  return (
    <div className="space-y-4">
      <Option
        label="Suggest posts from boards I haven’t joined"
        hint="A few of the best posts from PaperWing’s liveliest boards, marked Suggested, with a Join button. They’re the same for everyone: nothing about you is used to pick them."
        checked={boardPicks}
        onChange={(boardPicks) => set({ boardPicks })}
      />
      <Option
        label="Show PaperWing’s announcements"
        hint="News from PaperWing’s official board, pinned to the top for a few days. Dismiss one with its ✕; turn this off and they’re left out of For you."
        checked={announcements}
        onChange={(announcements) => set({ announcements })}
      />
    </div>
  )
}
