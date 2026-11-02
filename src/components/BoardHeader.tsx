import { Check, ChevronDown, Loader2, Pencil, Plus, Shield, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAtproto } from '../lib/atproto'
import { toggleJoin, useBoard } from '../lib/boards'
import { profilePath } from '../lib/people'
import { usePrefs } from '../lib/store'
import { canPost } from '../lib/social'
import { TOPIC_BY_ID } from '../lib/topics'
import { OfficialBadge } from './OfficialBadge'

/** The top of a community board: what it's for, its rules and who moderates it, and a way to join. */
export function BoardHeader({ did, rkey, uri }: { did: string; rkey: string; uri: string }) {
  const { data: board, isPending, error } = useBoard(did, rkey)
  const joined = usePrefs((p) => p.boards.some((b) => b.uri === uri))
  const me = useAtproto((a) => a.did)
  const [rules, setRules] = useState(false)

  if (isPending)
    return (
      <header className="px-3 pt-3 md:px-4 md:pt-4">
        <div className="grid h-32 place-items-center rounded-[18px] bg-panel text-ink-3">
          <Loader2 className="spin" />
        </div>
      </header>
    )
  if (error || !board)
    return (
      <header className="px-3 pt-3 md:px-4 md:pt-4">
        <div className="rounded-[18px] bg-panel p-5">
          <p className="text-[1.125rem] font-bold">This board didn’t load</p>
          <p className="mt-1 text-[0.875rem] text-ink-3">{error?.message ?? 'It may have been deleted by its owner.'}</p>
        </div>
      </header>
    )

  const mods = [board.owner, ...board.moderators.filter((m) => m !== board.owner)]
  const handle = (d: string) => (d === board.owner ? board.ownerHandle : board.moderatorHandles[d])
  const topic = board.topic ? TOPIC_BY_ID.get(board.topic) : undefined
  return (
    <header className="px-3 pt-3 md:px-4 md:pt-4">
      <div className="rounded-[18px] bg-panel p-4 md:p-5">
        <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-ink-3">
          <Users size={13} /> Community board{topic ? ` · ${topic.label}` : ''}
        </p>
        <h1 className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[1.5rem] font-bold leading-tight tracking-[-0.02em] [overflow-wrap:anywhere]">
          {board.name}
          {board.official && <OfficialBadge size={18} label />}
        </h1>
        {board.description && <p className="mt-1.5 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-2">{board.description}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={`btn h-9 text-[0.8125rem] ${joined ? 'following' : 'btn-primary'}`} onClick={() => toggleJoin({ uri, name: board.name })} aria-pressed={joined}>
            {joined ? <Check size={14} /> : <Plus size={14} />} {joined ? 'Joined' : 'Join'}
          </button>
          {me === board.owner && (
            <Link className="btn h-9 text-[0.8125rem]" to={`/boards/${rkey}`}>
              <Pencil size={14} /> Edit board
            </Link>
          )}
        </div>
        {board.rules && (
          <div className="mt-3">
            <button className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-ink-3" onClick={() => setRules(!rules)} aria-expanded={rules}>
              Rules <ChevronDown size={14} className={`transition-transform ${rules ? 'rotate-180' : ''}`} />
            </button>
            {rules && <p className="mt-1.5 whitespace-pre-line text-[0.875rem] leading-relaxed text-ink-2">{board.rules}</p>}
          </div>
        )}
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-ink-3">
          <Shield size={13} /> Moderated by
          {mods.map((m, i) => (
            <span key={m}>
              {handle(m) ? (
                <Link to={profilePath(handle(m)!)} className="font-semibold text-ink-2 hover:text-ink">
                  @{handle(m)}
                </Link>
              ) : (
                'a moderator'
              )}
              {i < mods.length - 1 ? ',' : ''}
            </span>
          ))}
        </p>
        <p className="mt-2 text-[0.8125rem] text-ink-3">
          {canPost(board, board.owner, me ?? '', !!board.official)
            ? 'To post here: open a story, tap Share, choose Post it to your networks, tick List it on PaperWing and pick this board. Votes are Bluesky likes; comments are replies.'
            : 'Only its moderators post here. You can still vote and reply: votes are Bluesky likes; comments are replies.'}
        </p>
      </div>
    </header>
  )
}
