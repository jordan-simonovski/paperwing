import { Link } from 'react-router'
import { findTopic } from '../lib/channels'
import { usePrefs } from '../lib/store'

export function TopicTag({ id }: { id: string }) {
  const interests = usePrefs((s) => s.interests)
  const t = findTopic(id, interests)
  if (!t) return null
  return (
    <Link to={`/t/${t.id}`} className="tag topic" style={{ '--h': t.hue } as React.CSSProperties} onClick={(e) => e.stopPropagation()}>
      {t.label}
    </Link>
  )
}

export function TopicChip({ id, count, small }: { id: string; count?: number; small?: boolean }) {
  const interests = usePrefs((s) => s.interests)
  const t = findTopic(id, interests)
  if (!t) return null
  return (
    <Link to={`/t/${t.id}`} className={`chip topic${small ? ' h-7 flex-none px-3 text-[0.8125rem]' : ''}`} style={{ '--h': t.hue } as React.CSSProperties}>
      {t.label}
      {count !== undefined && <span className="num font-normal opacity-75">{count}</span>}
    </Link>
  )
}
