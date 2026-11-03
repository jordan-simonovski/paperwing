import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { feed } from '../lib/sources/http'
import { usePrefs } from '../lib/store'
import { toast } from '../lib/ui'

/** Pages that publish the Statuspage API, for one-tap following. */
const SUGGESTED = [
  { host: 'status.clickhouse.com', name: 'ClickHouse Cloud' },
  { host: 'status.snowflake.com', name: 'Snowflake' },
  { host: 'status.mongodb.com', name: 'MongoDB Cloud' },
  { host: 'status.confluent.cloud', name: 'Confluent Cloud' },
  { host: 'status.temporal.io', name: 'Temporal' },
  { host: 'status.tailscale.com', name: 'Tailscale' },
  { host: 'status.pinecone.io', name: 'Pinecone' },
  { host: 'status.launchdarkly.com', name: 'LaunchDarkly' },
  { host: 'status.cursor.com', name: 'Cursor' },
  { host: 'status.mistral.ai', name: 'Mistral AI' },
]

const MAX = 25

export function StatusPagesSettings() {
  const { statusPages, set } = usePrefs()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const following = new Set(statusPages.map((p) => p.host))

  /** `typed` when it came from the box, which then empties; a suggestion leaves whatever you're typing alone. */
  const add = async (input: string, typed = false) => {
    if (statusPages.length >= MAX) return toast(`You can follow up to ${MAX} status pages`, { tone: 'error' })
    setBusy(true)
    try {
      // The server checks the page is public and publishes incidents, and learns what it calls itself.
      const { host, name, builtIn } = (await feed('statuscheck', { host: input })) as { host: string; name: string; builtIn?: boolean }
      if (builtIn) return toast(`${name} status is already built in`)
      if (following.has(host)) return toast(`Already following ${name}`)
      set({ statusPages: [...statusPages, { host, name }] })
      if (typed) setDraft('')
      toast(`Following ${name} status`)
    } catch (err) {
      toast((err as Error).message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const suggestions = SUGGESTED.filter((s) => !following.has(s.host))

  return (
    <>
      {statusPages.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {statusPages.map((p) => (
            <li key={p.host} className="chip h-8 gap-1.5 pl-3 pr-1.5" title={p.host}>
              {p.name}
              <button className="icon-btn h-6 w-6" onClick={() => set({ statusPages: statusPages.filter((x) => x.host !== p.host) })} aria-label={`Stop following ${p.name}`}>
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) void add(draft, true)
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="status.example.com"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-10 min-w-0 flex-1 rounded-full bg-sunk px-4 text-[0.9375rem] placeholder:text-ink-3"
          aria-label="Status page address"
        />
        <button className="btn" type="submit" disabled={busy || !draft.trim()}>
          {busy ? 'Checking…' : 'Follow'}
        </button>
      </form>
      {suggestions.length > 0 && (
        <div>
          <p className="mb-2 text-[0.8125rem] text-ink-3">Or one of these:</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s.host} className="chip h-8 gap-1 px-3" disabled={busy} onClick={() => void add(s.host)} title={s.host}>
                <Plus size={13} />
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
