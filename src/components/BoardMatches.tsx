import { Users } from 'lucide-react'
import { Link } from 'react-router'
import { findBoards } from '../lib/boardFinder'
import { boardPath, useAllBoards } from '../lib/boards'
import { OfficialBadge } from './OfficialBadge'

/** Community boards matching a search, above its stories: a board is often what someone's looking for. */
export function BoardMatches({ query }: { query: string }) {
  const { data: boards = [] } = useAllBoards()
  const found = findBoards(boards, query).slice(0, 4)
  if (!found.length) return null
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5" aria-label="Boards">
      <span className="mr-0.5 text-[0.8125rem] font-semibold text-ink-3">Boards</span>
      {found.map((b) => (
        <Link key={b.uri} className="chip h-8 gap-1.5 px-3 text-[0.875rem]" to={boardPath(b.uri)}>
          <Users size={13} aria-hidden /> {b.name}
          {b.official && <OfficialBadge size={13} />}
        </Link>
      ))}
    </div>
  )
}
