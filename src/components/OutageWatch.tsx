import { keys } from '../lib/query'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronDown, Radio } from 'lucide-react'
import { useState } from 'react'
import { ago } from '../lib/format'
import type { OutageReport, ProviderReport } from '../lib/outageTypes'

export function useOutages() {
  return useQuery({
    queryKey: keys.outages,
    queryFn: async () => (await (await fetch('/api/outages')).json()) as OutageReport,
    staleTime: 60_000,
    refetchInterval: () => (document.visibilityState === 'visible' ? 2 * 60_000 : false),
  })
}

const admits = (p: ProviderReport) => !!p.status && p.status.indicator !== 'none'

function statusLine(p: ProviderReport) {
  if (!p.status) return null
  return (
    <a href={p.status.url} target="_blank" rel="noopener noreferrer" className="underline decoration-[var(--line-strong)] underline-offset-2 hover:text-ink">
      Status page: {p.status.description}
    </a>
  )
}

/** Shown above feeds when people are reporting a provider down, or a status page admits trouble. */
export function OutageBanner() {
  const { data } = useOutages()
  const [open, setOpen] = useState<string>()
  const now = Date.now()
  const alerts = (data?.providers ?? []).filter((p) => p.level === 'spike' || (admits(p) && p.status!.indicator !== 'minor' && p.recent > 0))
  if (!alerts.length) return null
  return (
    <div className="mx-3 mt-3 space-y-2 md:mx-4" role="status">
      {alerts.map((p) => (
        <div key={p.id} className="rounded-[14px] bg-signal-soft px-4 py-3">
          <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(open === p.id ? undefined : p.id)} aria-expanded={open === p.id}>
            <AlertTriangle size={18} className="mt-0.5 flex-none text-signal" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{p.level === 'spike' ? `Possible ${p.name} outage` : `${p.name} reports trouble`}</span>
              <span className="block text-[0.875rem] text-ink-2">
                {p.recent > 0 && (
                  <>
                    <span className="num">{p.recent}</span> {p.recent === 1 ? 'person' : 'people'} reporting problems in the last 30 minutes
                    {Math.round(p.baseline) >= 1 ? `, up from about ${Math.round(p.baseline)}` : ''}.{' '}
                  </>
                )}
              </span>
            </span>
            <ChevronDown size={16} className={`mt-1 flex-none transition-transform ${open === p.id ? 'rotate-180' : ''}`} />
          </button>
          {/* Outside the button: a link inside one can't be reached or opened on its own. */}
          {p.status && <p className="ml-[30px] text-[0.875rem] text-ink-2">{statusLine(p)}</p>}
          {open === p.id && p.samples.length > 0 && (
            <ul className="mt-2 space-y-1.5 border-t border-[var(--line)] pt-2 text-[0.875rem]">
              {p.samples.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-ink-2 hover:text-ink">
                    “{s.text}” <span className="text-ink-3">{ago(s.at, now)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

/** The full picture for SRE: every provider with any chatter, and every status page admitting trouble. */
export function OutagePanel() {
  const { data, isPending } = useOutages()
  const providers = data?.providers ?? []
  return (
    <section>
      <h3 className="label mb-2 flex items-center gap-2">
        <Radio size={14} /> Outage watch
      </h3>
      {isPending ? (
        <p className="text-[0.875rem] text-ink-3">Listening…</p>
      ) : !providers.length ? (
        <p className="text-[0.9375rem] text-ink-2">Quiet. Nobody is reporting the big providers down, and their status pages are green.</p>
      ) : (
        <ul className="space-y-2">
          {providers.map((p) => (
            <li key={p.id} className="flex items-baseline gap-3 text-[0.9375rem]">
              <span className={`w-28 flex-none font-semibold ${p.level === 'spike' ? 'text-signal' : ''}`}>{p.name}</span>
              <span className="min-w-0 text-ink-2">
                {p.recent > 0 ? `${p.recent} reporting in 30 min` : 'No reports'}
                {p.status ? <span className="text-ink-3">. {p.status.description}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data && <p className="mt-2 text-[0.8125rem] text-ink-3">From {data.scanned} recent Bluesky posts and HN titles, checked every two minutes.</p>}
    </section>
  )
}
