import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { SourceChannelIcon } from '../components/SourceIcon'
import { TopicCard } from '../components/TopicCard'
import { followsTech, interestTopic, sourceChannels } from '../lib/channels'
import { usePrefs } from '../lib/store'
import { CLUSTERS, searchTopics, TOPICS, type ClusterId } from '../lib/topics'

/** Explore's Topics tab: every pack, its sources, and your own interests. */
export function TopicsBody() {
  const { interests, set, followed, addInterest } = usePrefs()
  const [filter, setFilter] = useState('')
  const [draft, setDraft] = useState('')
  const navigate = useNavigate()
  const matches = useMemo(() => (filter ? new Set(searchTopics(filter).map((h) => h.topic.id)) : null), [filter])
  // Whichever pack you read most comes first.
  const tech = followsTech(followed)
  const clusters = (Object.keys(CLUSTERS) as ClusterId[]).sort((a, b) => Number(CLUSTERS[a].pack !== (tech ? 'tech' : 'general')) - Number(CLUSTERS[b].pack !== (tech ? 'tech' : 'general')))

  return (
    <>
      <p className="mt-2 max-w-xl text-[0.9375rem] text-ink-2 max-sm:hidden">
        Every topic pulls from its own mix of sources and tags stories by keyword, so you can move sideways from one to its neighbours.
      </p>

      {/* Finding a topic comes first: on a phone it's the first thing under the tabs. */}
      <label className="relative mt-5 block max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
        <input
          className="input pl-10"
          type="search"
          placeholder={tech ? 'Find a topic: “tracing”, “gpu”' : 'Find a topic: “election”, “telescope”'}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Find a topic"
        />
      </label>

      <section className="mt-6">
        <h2 className="text-[0.8125rem] font-semibold text-ink-3">Sources</h2>
        <div className="mt-2 flex flex-wrap gap-2 max-sm:-mx-4 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-4 max-sm:[scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]">
          {sourceChannels(followed).map((c) => (
            <Link key={c.id} to={`/t/${c.id}`} className="chip h-9 flex-none gap-2 px-3.5 text-[0.875rem]">
              <SourceChannelIcon mark={c.mark} />
              {c.label}
            </Link>
          ))}
        </div>
      </section>

      {clusters.map((c) => (
        <section key={c} className="mt-9">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-[1.125rem] font-bold">{CLUSTERS[c].label}</h2>
            <span className="text-[0.875rem] text-ink-3">{CLUSTERS[c].blurb}</span>
          </div>
          <div className="tcard-rail mt-3">
            {/* While filtering, matches come first so a phone's swipe row starts with them. */}
            {TOPICS.filter((t) => t.cluster === c)
              .sort((a, b) => (matches ? Number(matches.has(b.id)) - Number(matches.has(a.id)) : 0))
              .map((t) => (
                <TopicCard key={t.id} t={t} dim={!!matches && !matches.has(t.id)} />
              ))}
          </div>
        </section>
      ))}

      <section className="mt-12">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-[1.125rem] font-bold">Your interests</h2>
          <span className="text-[0.875rem] text-ink-3">Anything you can search for can become a feed</span>
        </div>
        <form
          className="mt-4 flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!draft.trim()) return
            const i = addInterest(draft)
            setDraft('')
            navigate(`/t/${i.id}`)
          }}
        >
          <input className="input" placeholder="e.g. duckdb, “platform engineering”, zig" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button className="btn btn-primary h-9">Add</button>
        </form>
        {interests.length > 0 && (
          <div className="tcard-rail mt-4">
            {interests.map((i) => (
              <TopicCard key={i.id} t={interestTopic(i)} onRemove={() => set({ interests: interests.filter((x) => x.id !== i.id), followed: followed.filter((f) => f !== i.id) })} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
