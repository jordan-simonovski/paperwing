import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { compact } from '../lib/format'
import { useFriendsOf } from '../lib/friends'
import type { Story } from '../lib/types'
import { DID, Face, FriendsSummary, friendsTitle } from './FriendsLine'

/**
 * The reader's friends line: tap it for everyone you follow who took part, and what they did. A
 * quote, post or reply opens in the reader, to read, like or answer; a repost isn't theirs to answer.
 */
export function FriendsList({ story, className = '', onOpen }: { story: Pick<Story, 'url' | 'sharedBy'> & { alsoOn?: Pick<Story, 'url'>[] }; className?: string; onOpen: (key: string) => void }) {
  const friends = useFriendsOf(story)
  const [open, setOpen] = useState(false)
  if (!friends.length) return null
  return (
    <div className={className}>
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-2 text-left text-[0.8125rem] text-ink-3 hover:text-ink-2"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title={friendsTitle(friends)}
      >
        <FriendsSummary friends={friends} />
        <ChevronDown size={14} className={`flex-none transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <ul className="-mx-2 mt-2 space-y-0.5" aria-label="People you follow on this story">
          {friends.map((f) => {
            const body = (
              <>
                <Face f={f} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.875rem]">
                    <span className="font-semibold text-ink">{f.name ?? `@${f.handle}`}</span> <span className="text-ink-3">{DID[f.how]}</span>
                  </span>
                  {f.text && f.post && <span className="line-clamp-2 block text-[0.875rem] text-ink-2">{f.text}</span>}
                  {f.post && (
                    <span className="meta mt-0.5">
                      <span className="num">{compact(f.likes ?? 0)} likes</span>
                      <span className="num">{compact(f.replies ?? 0)} replies</span>
                    </span>
                  )}
                </span>
              </>
            )
            return (
              <li key={f.handle}>
                {f.post ? (
                  <button type="button" className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-sunk" onClick={() => onOpen(f.post!)}>
                    {body}
                  </button>
                ) : (
                  <div className="flex items-start gap-3 px-2 py-2">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
