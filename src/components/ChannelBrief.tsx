import { useMemo } from 'react'
import type { Channel } from '../lib/channels'
import { ago, compact } from '../lib/format'
import type { FeedStatus } from '../lib/hooks'
import type { Ranked } from '../lib/rank'
import { SourceStatusList } from './FeedHeader'
import { OutagePanel } from './OutageWatch'
import { scoreUnit, sourceLabel } from './Source'
import { StoryIcon } from './SourceIcon'
import { TopicChip } from './TopicTag'

/** What the reader shows before anything is opened: a briefing on the channel rather than a blank wall. */
export function ChannelBrief({ channel, stories, statuses, onOpen, now }: { channel: Channel; stories: Ranked[]; statuses: FeedStatus[]; onOpen: (key: string) => void; now: number }) {
  // Stories seen in more than one place first: that is where the conversation is.
  const crossings = useMemo(
    () =>
      stories
        .filter((s) => s.alsoOn.length > 0 || s.coverage?.some((c) => c.hasThread))
        .map((s) => ({ s, total: [s, ...s.alsoOn, ...(s.coverage ?? [])].reduce((n, a) => n + (a.hasThread ? (a.comments ?? 0) : 0), 0) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5),
    [stories],
  )
  const moving = useMemo(
    () =>
      [...stories]
        .filter((s) => now - s.createdAt < 36 * 3_600_000 && !s.alsoOn.length && !s.coverage?.length)
        .sort((a, b) => b.heat - a.heat)
        .slice(0, 5),
    [stories, now],
  )
  const topicCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of stories) for (const t of s.topics) if (t !== channel.id) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  }, [stories, channel.id])
  const working = statuses.filter((s) => s.status === 'success').length

  return (
    <div className="h-full overflow-y-auto px-8 py-10">
      <div className="mx-auto max-w-[40rem]">
        <h2 className="text-[1.375rem] font-bold leading-snug tracking-tight">{stories.length ? `${stories.length} stories from ${working} ${working === 1 ? 'source' : 'sources'}` : 'Tuning in'}</h2>
        <p className="mt-1 text-[0.9375rem] text-ink-2">Open a story to read it here, or start with where the conversation is.</p>

        {['sre', 'observability', 'cloud-native'].includes(channel.id) && (
          <div className="mt-9">
            <OutagePanel />
          </div>
        )}

        {crossings.length > 0 && (
          <section className="mt-9">
            <h3 className="label mb-3">Discussed in more than one place</h3>
            <ul className="space-y-1">
              {crossings.map(({ s, total }) => (
                <li key={s.key}>
                  <button className="flex w-full items-start gap-4 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-sunk" onClick={() => onOpen(s.key)}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[1rem] font-semibold leading-snug">{s.title}</span>
                      <span className="mt-0.5 block text-[0.8125rem] text-ink-3">
                        {[s, ...s.alsoOn, ...(s.coverage ?? [])]
                          .filter((x) => x.hasThread)
                          .map(sourceLabel)
                          .filter((v, i, a) => a.indexOf(v) === i)
                          .join(', ')}
                      </span>
                    </span>
                    <span className="num flex-none text-right text-[1rem] font-bold">
                      {compact(total)}
                      <span className="block text-[0.75rem] font-normal text-ink-3">comments</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {moving.length > 0 && (
          <section className="mt-9">
            <h3 className="label mb-3">Moving fastest</h3>
            <ol className="space-y-1">
              {moving.map((s) => (
                <li key={s.key}>
                  <button className="w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-sunk" onClick={() => onOpen(s.key)}>
                    <span className="block text-[1rem] font-semibold leading-snug">{s.title}</span>
                    <span className="meta mt-0.5">
                      <span className="inline-flex items-center gap-1.5 self-center">
                        <StoryIcon story={s} size={13} />
                        {sourceLabel(s)}
                      </span>
                      {!!s.score && (
                        <span className="num">
                          {compact(s.score)} {scoreUnit(s.source, s.score)}
                        </span>
                      )}
                      <span>{ago(s.createdAt, now)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}

        {topicCounts.length > 0 && (
          <section className="mt-9">
            <h3 className="label mb-3">Running through this feed</h3>
            <div className="flex flex-wrap gap-1.5">
              {topicCounts.map(([id, n]) => (
                <TopicChip key={id} id={id} count={n} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-9">
          <h3 className="label mb-2">Sources</h3>
          <SourceStatusList statuses={statuses} />
        </section>

        <p className="mt-10 flex flex-wrap items-center gap-x-2 gap-y-2 text-[0.8125rem] text-ink-3">
          <kbd>j</kbd>
          <kbd>k</kbd> to move, <kbd>enter</kbd> to open, <kbd>⌘K</kbd> to find a topic, <kbd>?</kbd> for the rest
        </p>
      </div>
    </div>
  )
}
