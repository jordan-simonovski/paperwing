import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import type { Hiring } from '../lib/hiringTypes'
import { keys } from '../lib/query'
import { feed } from '../lib/sources/http'

const DAY = 86_400_000
const count = (n: number) => n.toLocaleString('en-GB')

/** Boards date a posting by the day, so this says the day, not the hour. */
export function postedDay(iso: string, now: number): string {
  const days = Math.max(0, Math.round((Date.parse(new Date(now).toISOString().slice(0, 10)) - Date.parse(iso)) / DAY))
  return days === 0 ? 'posted today' : days === 1 ? 'posted yesterday' : `posted ${days} days ago`
}

export function useHiring(employer: string | undefined) {
  return useQuery({
    queryKey: keys.hiring(employer ?? ''),
    queryFn: () => feed('hiring', { employer }) as Promise<Hiring>,
    enabled: !!employer,
    staleTime: 6 * 60 * 60_000,
    retry: false,
  })
}

/** Beside a story about an employer's layoffs: what it's still hiring for, from its own job board. */
export function StillHiring({ employer, now }: { employer: string; now: number }) {
  const { data, isPending, isError } = useHiring(employer)
  if (isError) return null
  if (isPending) return <div className="skel h-28" role="status" aria-label={`Loading ${employer}’s openings`} />
  if (!data.open) {
    return (
      <section aria-labelledby="hiring-head">
        <h2 id="hiring-head" className="label mb-1">
          Still hiring?
        </h2>
        <p className="text-[0.9375rem] text-ink-2">
          {data.employer}’s{' '}
          <a href={data.board} target="_blank" rel="noopener noreferrer" className="underline decoration-[var(--line-strong)] underline-offset-2">
            job board
          </a>{' '}
          lists no open roles right now.
        </p>
      </section>
    )
  }
  const top = data.functions.slice(0, 5)
  const most = top[0]?.[1] ?? 1
  return (
    <section aria-labelledby="hiring-head">
      <h2 id="hiring-head" className="label mb-1">
        Still hiring
      </h2>
      <p className="mb-3 text-[0.9375rem] text-ink-2">
        {data.employer} lists <span className="num font-semibold text-ink">{count(data.open)}</span> open {data.open === 1 ? 'role' : 'roles'}
        {data.fresh ? (
          <>
            , <span className="num font-semibold text-ink">{data.fresh}</span> posted in the last two weeks
          </>
        ) : null}
        .
      </p>
      <ul className="mb-4 space-y-1.5" aria-label="Open roles by kind of work">
        {top.map(([name, n]) => (
          <li key={name} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[0.875rem]">
            <span className="truncate text-ink-2">{name}</span>
            <span className="h-1.5 rounded-full bg-sunk" aria-hidden>
              <span className="block h-full rounded-full bg-ink-3" style={{ width: `${Math.max(4, (100 * n) / most)}%` }} />
            </span>
            <span className="num text-right text-ink-2">{count(n)}</span>
          </li>
        ))}
      </ul>
      {data.latest.length > 0 && (
        <>
          <h3 className="mb-1 text-[0.8125rem] font-semibold text-ink-3">Latest openings</h3>
          <ul className="-mx-3 mb-2">
            {data.latest.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl px-3 py-2 transition-colors hover:bg-sunk">
                  <span className="block text-[0.9375rem] font-semibold leading-snug">{r.title}</span>
                  <span className="meta mt-0.5">
                    <span>{r.function}</span>
                    {r.location && <span>{r.location}</span>}
                    {r.postedAt && <span>{postedDay(r.postedAt, now)}</span>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <a href={data.board} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[0.875rem] font-semibold text-ink-2 hover:text-ink">
        See every opening on {data.employer}’s job board <ExternalLink size={13} aria-hidden />
      </a>
    </section>
  )
}
