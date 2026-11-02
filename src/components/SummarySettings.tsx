import { useEffect, useState } from 'react'
import { ownKey, summaryStatus } from '../lib/summary'
import { toast } from '../lib/ui'

/** Your own Anthropic key for discussion summaries, kept in this browser only. Settings and onboarding. */
export function SummarySettings() {
  const [server, setServer] = useState<boolean>()
  const [mine, setMine] = useState(() => !!ownKey.get())
  const [draft, setDraft] = useState('')
  useEffect(() => void summaryStatus().then((s) => setServer(s.server)), [])
  return (
    <>
      <p className="text-[0.9375rem] leading-relaxed text-ink-2">
        {server === undefined
          ? 'Checking…'
          : server
            ? 'This deployment has its own Anthropic key, so summaries work without one of yours (up to a daily limit).'
            : 'This deployment has no Anthropic key of its own. Add yours below, or set ANTHROPIC_API_KEY on the deployment.'}
      </p>
      {mine ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-[0.9375rem]">Using your own Anthropic key from this browser.</p>
          <button
            className="btn"
            onClick={() => {
              ownKey.set(undefined)
              setMine(false)
              toast('Your key is removed from this browser')
            }}
          >
            Remove my key
          </button>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!/^sk-ant-/.test(draft.trim())) return toast('That doesn’t look like an Anthropic API key (sk-ant-…)', { tone: 'error' })
            ownKey.set(draft.trim())
            setDraft('')
            setMine(true)
            toast('Saved in this browser')
          }}
        >
          <input
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="sk-ant-…"
            className="h-10 min-w-0 flex-1 rounded-full bg-sunk px-4 font-mono text-[0.875rem] placeholder:text-ink-3 focus:outline-none"
            aria-label="Your Anthropic API key"
          />
          <button className="btn" type="submit">
            Use my key
          </button>
        </form>
      )}
      <p className="text-[0.8125rem] leading-relaxed text-ink-3">
        Your key stays in this browser: it isn't synced, and it's only sent to this PaperWing deployment with each summary request, which passes it to Anthropic and keeps nothing.
      </p>
    </>
  )
}
