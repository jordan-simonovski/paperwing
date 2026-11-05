import { MessageCircle, Quote, Repeat2 } from 'lucide-react'
import { useFriendsOf, type Friend } from '../lib/friends'
import type { Story } from '../lib/types'

// The feed row's line. The reader's version, which opens into who did what, is FriendsList: kept
// apart so the feed's first load carries only this.

/** What each way of taking part reads as: in the summary line, and on a person's own row. */
const VERB: Record<Friend['how'], string> = { quoted: 'quoted', posted: 'shared', shared: 'shared', replied: 'discussed', reposted: 'reposted' }
export const DID: Record<Friend['how'], string> = { quoted: 'quoted it', posted: 'posted it', shared: 'shared it', replied: 'replied', reposted: 'reposted it' }
/** A small mark on the face, so a quote stands out at a glance. A plain post needs none. */
const BADGE: Partial<Record<Friend['how'], typeof Quote>> = { quoted: Quote, replied: MessageCircle, reposted: Repeat2 }

const listOf = (words: string[]) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`)

export function Face({ f, size, overlap = false }: { f: Friend; size: number; overlap?: boolean }) {
  const Badge = BADGE[f.how]
  return (
    <span className={`relative inline-block flex-none ${overlap ? '-ml-1.5' : ''}`} style={{ width: size, height: size }}>
      {f.avatar ? (
        <img src={f.avatar} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-full rounded-full object-cover ring-2 ring-[var(--ground)]" />
      ) : (
        <span className="grid size-full place-items-center rounded-full bg-sunk text-[0.625rem] font-bold ring-2 ring-[var(--ground)]">{f.handle[0]?.toUpperCase()}</span>
      )}
      {Badge && (
        <span className="absolute -bottom-1 -right-1 grid size-[13px] place-items-center rounded-full bg-ink text-[var(--ground)] ring-2 ring-[var(--ground)]">
          <Badge size={8} strokeWidth={3} aria-hidden />
        </span>
      )}
    </span>
  )
}

/** Their faces and "Alice, Bob and 3 more you follow quoted and shared this". */
export function FriendsSummary({ friends }: { friends: Friend[] }) {
  const first = friends.slice(0, 3)
  // Side by side, not stacked, when any carries a mark: a badge would cover the next face.
  const marked = first.some((f) => BADGE[f.how])
  const names = friends.slice(0, 2).map((f) => f.name ?? `@${f.handle}`)
  const more = friends.length - names.length
  return (
    <>
      <span className={`flex flex-none ${marked ? 'gap-1.5' : ''}`} aria-hidden>
        {first.map((f, i) => (
          <Face key={f.handle} f={f} size={18} overlap={i > 0 && !marked} />
        ))}
      </span>
      <span className="min-w-0 truncate">
        <span className="font-semibold text-ink-2">{names.join(more ? ', ' : ' and ')}</span>
        {more ? ` and ${more} more you follow` : ''} {listOf([...new Set(friends.map((f) => VERB[f.how]))])} this
      </span>
    </>
  )
}

export const friendsTitle = (friends: Friend[]) => `People you follow on Bluesky:\n${friends.map((f) => `${f.name ? `${f.name} ` : ''}@${f.handle} (${DID[f.how]})`).join('\n')}`

/** "Alice quoted this, Bob and 3 more shared it", with their faces: people you follow on Bluesky who took part in the link's conversation. */
export function FriendsLine({ story, className = '' }: { story: Pick<Story, 'url' | 'sharedBy'> & { alsoOn?: Pick<Story, 'url'>[] }; className?: string }) {
  const friends = useFriendsOf(story)
  if (!friends.length) return null
  return (
    <p className={`flex min-w-0 items-center gap-2 text-[0.8125rem] text-ink-3 ${className}`} title={friendsTitle(friends)}>
      <FriendsSummary friends={friends} />
    </p>
  )
}
