import { useEffect } from 'react'
import { Link } from 'react-router'
import { Pip } from '../components/Pip'
import changelog from '../generated/changelog.json'
import { markReleaseRead } from '../lib/whatsNew'

// "What's new": every release in plain words, newest first, grouped the way readers think about
// changes (highlights, breaking changes, new, improved, fixes). Written from changesets at release
// (.changeset/README.md, scripts/changelog/), so it's the same list as CHANGELOG.md.

export interface Change {
  title: string
  detail: string
}
export interface Release {
  version: string
  date: string | null
  sections: { kind: string; title: string; changes: Change[] }[]
}

/** How each kind of change is marked: the colour it wears in the list. */
const MARK: Record<string, string> = {
  highlight: 'bg-signal text-white',
  breaking: 'bg-[color-mix(in_oklab,var(--signal)_16%,transparent)] text-signal',
  new: 'bg-ink text-ground',
  improved: 'bg-sunk text-ink-2',
  fix: 'bg-sunk text-ink-3',
}

export function ReleaseNotes({ release, current }: { release: Release; current?: boolean }) {
  return (
    <section className="border-t border-line pt-7 first:border-t-0 first:pt-0" aria-labelledby={`v${release.version}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={`v${release.version}`} className="num text-[1.375rem] font-bold tracking-[-0.01em]">
          {release.version}
        </h2>
        {release.date && <span className="text-[0.875rem] text-ink-3">{release.date}</span>}
        {current && <span className="rounded-full bg-sunk px-2 py-0.5 text-[0.75rem] font-semibold text-ink-2">You’re on this one</span>}
      </div>
      {release.sections.map((s) => (
        <div key={s.title} className="mt-5">
          <h3 className="flex items-center gap-2 text-[0.8125rem] font-bold uppercase tracking-[0.06em] text-ink-3">
            <span className={`inline-block rounded-full px-2 py-0.5 text-[0.6875rem] normal-case tracking-normal ${MARK[s.kind] ?? MARK.improved}`}>{s.title}</span>
          </h3>
          <ul className="mt-3 space-y-3.5">
            {s.changes.map((c) => (
              <li key={c.title} className="text-[0.9375rem] leading-relaxed">
                <span className="font-semibold text-ink">{c.title}</span> <span className="text-ink-2">{c.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

export function WhatsNew({ releases, version }: { releases: Release[]; version: string }) {
  return (
    <div className="wide-col">
      <article className="mx-auto max-w-[44rem] px-4 pb-24 pt-8 md:px-8">
        <Pip variant="head" className="size-12" />
        <h1 className="mt-4 text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em]">What’s new</h1>
        <p className="mt-4 text-[1.0625rem] leading-relaxed text-ink-2">
          Every release of PaperWing, newest first. You’re on version <span className="num font-semibold text-ink">{version}</span>. Ideas and bugs are welcome on{' '}
          <Link to="/settings/app" className="font-semibold text-ink underline underline-offset-2">
            the About page
          </Link>
          .
        </p>
        <div className="mt-10 space-y-10">
          {releases.length ? releases.map((r) => <ReleaseNotes key={r.version} release={r} current={r.version === version} />) : <p className="text-ink-3">Nothing released yet.</p>}
        </div>
      </article>
    </div>
  )
}

export function WhatsNewPage() {
  useEffect(() => {
    document.title = 'What’s new – PaperWing'
    markReleaseRead()
  }, [])
  return <WhatsNew releases={changelog.releases} version={__BUILD__.version} />
}
