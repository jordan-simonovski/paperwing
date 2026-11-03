import { usePrefs } from '../lib/store'

/** Settings: how posting from PaperWing works for you. */
export function PostingSettings() {
  const requireAlt = usePrefs((p) => p.requireAlt)
  const set = usePrefs((p) => p.set)
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" className="mt-0.5 h-[1.125rem] w-[1.125rem] flex-none accent-[var(--ink)]" checked={requireAlt} onChange={(e) => set({ requireAlt: e.target.checked })} />
      <span>
        <span className="block text-[0.9375rem] text-ink-2">Require alt text</span>
        <span className="block text-[0.8125rem] text-ink-3">
          A post can’t go until every picture has a description, for people who can’t see it. Screen readers read it aloud, and it shows when a picture doesn’t load.
        </span>
      </span>
    </label>
  )
}
