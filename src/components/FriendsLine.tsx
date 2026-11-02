import { useFriendsOf } from '../lib/friends'
import type { Story } from '../lib/types'

/** "Alice and Bob shared this", with their faces: people you follow on Bluesky who shared or discussed the link. */
export function FriendsLine({ story, className = '' }: { story: Pick<Story, 'url' | 'sharedBy'> & { alsoOn?: Pick<Story, 'url'>[] }; className?: string }) {
  const friends = useFriendsOf(story)
  if (!friends.length) return null
  const names = friends.slice(0, 2).map((f) => f.name ?? `@${f.handle}`)
  const more = friends.length - names.length
  const verb = friends.some((f) => f.how === 'shared') ? 'shared this' : friends.length === 1 ? 'is discussing this' : 'are discussing this'
  return (
    <p
      className={`flex min-w-0 items-center gap-2 text-[0.8125rem] text-ink-3 ${className}`}
      title={`People you follow on Bluesky:\n${friends.map((f) => `${f.name ? `${f.name} ` : ''}@${f.handle} (${f.how})`).join('\n')}`}
    >
      <span className="flex flex-none" aria-hidden>
        {friends.slice(0, 3).map((f, i) =>
          f.avatar ? (
            <img
              key={f.handle}
              src={f.avatar}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              className={`size-[18px] rounded-full object-cover ring-2 ring-[var(--ground)] ${i ? '-ml-1.5' : ''}`}
            />
          ) : (
            <span key={f.handle} className={`grid size-[18px] place-items-center rounded-full bg-sunk text-[0.625rem] font-bold ring-2 ring-[var(--ground)] ${i ? '-ml-1.5' : ''}`}>
              {f.handle[0]?.toUpperCase()}
            </span>
          ),
        )}
      </span>
      <span className="min-w-0 truncate">
        <span className="font-semibold text-ink-2">{names.join(more ? ', ' : ' and ')}</span>
        {more ? ` and ${more} more you follow` : ''} {verb}
      </span>
    </p>
  )
}
