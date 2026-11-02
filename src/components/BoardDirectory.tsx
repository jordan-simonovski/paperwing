import { Check, Plus, Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { activityLabel, byActivity, findBoards } from '../lib/boardFinder'
import { boardPath, toggleJoin, useAllBoards } from '../lib/boards'
import { usePrefs } from '../lib/store'
import { OfficialBadge } from './OfficialBadge'

/**
 * Every community board on PaperWing, found on the open network: the liveliest first (PaperWing's
 * own above all), or the newest, and searchable by name and what they're about.
 */
export function BoardDirectory() {
  const { data: all = [], isPending } = useAllBoards()
  const joined = usePrefs((p) => p.boards)
  const [order, setOrder] = useState<'active' | 'new'>('active')
  const [query, setQuery] = useState('')
  const q = useDeferredValue(query.trim())
  const shown = useMemo(() => {
    const sorted = order === 'active' ? byActivity(all) : [...all].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    return q ? findBoards(sorted, q) : sorted
  }, [all, order, q])

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-[0.9375rem] text-ink-2">Spaces run by their communities, with their own rules and moderators. Each lives in its owner’s Bluesky account.</p>
        <Link className="btn btn-primary" to="/boards">
          <Plus size={15} /> Start a board
        </Link>
      </div>
      {all.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
            <input className="input pl-9" type="search" placeholder="Find a board" aria-label="Find a board" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="seg flex-none" role="group" aria-label="Order">
            <button aria-pressed={order === 'active'} onClick={() => setOrder('active')}>
              Active
            </button>
            <button aria-pressed={order === 'new'} onClick={() => setOrder('new')}>
              New
            </button>
          </div>
        </div>
      )}
      {isPending ? (
        <p className="mt-6 text-ink-3">Finding boards…</p>
      ) : all.length === 0 ? (
        <p className="mt-6 text-ink-3">No community boards yet. Start the first one.</p>
      ) : shown.length === 0 ? (
        <p className="mt-6 text-ink-3">No board matches “{q}”.</p>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {shown.map((b) => {
            const isIn = joined.some((j) => j.uri === b.uri)
            return (
              <div key={b.uri} className="flex flex-col rounded-[18px] bg-panel p-4">
                <h3 className="flex items-center gap-1.5 text-[1.0625rem] font-bold">
                  <Link to={boardPath(b.uri)} className="hover:underline">
                    {b.name}
                  </Link>
                  {b.official && <OfficialBadge size={15} label />}
                </h3>
                {b.description && <p className="mt-1 line-clamp-3 text-[0.875rem] text-ink-2">{b.description}</p>}
                <p className="mt-2 text-[0.8125rem] text-ink-3">
                  {b.official ? 'Run by PaperWing' : b.ownerHandle ? `Started by @${b.ownerHandle}` : 'Community board'}
                  {b.active !== undefined && ` · ${activityLabel(b.active)}`}
                </p>
                <div className="mt-3 flex gap-2">
                  <button className={`btn h-9 text-[0.8125rem] ${isIn ? 'following' : 'btn-primary'}`} onClick={() => toggleJoin(b)} aria-pressed={isIn}>
                    {isIn ? <Check size={14} /> : <Plus size={14} />} {isIn ? 'Joined' : 'Join'}
                  </button>
                  <Link className="btn h-9 text-[0.8125rem]" to={boardPath(b.uri)}>
                    Open
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
