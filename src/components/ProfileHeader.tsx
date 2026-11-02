import { Check, ExternalLink, Layers, Loader2, Pencil, Plus, Share2 } from 'lucide-react'
import { Link } from 'react-router'
import { useAtproto } from '../lib/atproto'
import { compact, plural } from '../lib/format'
import { profilePath, usePerson } from '../lib/people'
import { usePrefs } from '../lib/store'
import { homeOrigin, share, toast } from '../lib/ui'
import { RssButton } from './RssButton'
import { SourceIcon } from './SourceIcon'

/**
 * The top of someone's profile (/u/<handle>): who they are, what they've drawn on PaperWing, the
 * mixes they've published, and a Follow that brings their listings into For you.
 */
export function ProfileHeader({ actor }: { actor: string }) {
  const { data, isPending, error } = usePerson(actor)
  const people = usePrefs((p) => p.people)
  const set = usePrefs((p) => p.set)
  const me = useAtproto((a) => a.did)

  if (isPending)
    return (
      <header className="px-3 pt-3 md:px-4 md:pt-4">
        <div className="grid h-36 place-items-center rounded-[18px] bg-panel text-ink-3">
          <Loader2 className="spin" />
        </div>
      </header>
    )
  if (error || !data)
    return (
      <header className="px-3 pt-3 md:px-4 md:pt-4">
        <div className="rounded-[18px] bg-panel p-5">
          <p className="text-[1.125rem] font-bold">Couldn’t find @{actor}</p>
          <p className="mt-1 text-[0.875rem] text-ink-3">{error?.message ?? 'Check the handle and try again.'}</p>
        </div>
      </header>
    )

  const { profile, mixes, totals } = data
  const following = people.some((p) => p.did === profile.did)
  const mine = me === profile.did
  const toggle = () => {
    const next = following
      ? people.filter((p) => p.did !== profile.did)
      : [...people, { did: profile.did, handle: profile.handle, ...(profile.name ? { name: profile.name } : {}), ...(profile.avatar ? { avatar: profile.avatar } : {}) }]
    set({ people: next })
    toast(following ? `Unfollowed @${profile.handle}` : `Following @${profile.handle}: what they list joins For you`)
  }
  const stats = [
    plural(totals.listed, 'story', 'stories') + ' listed',
    data.shares?.length ? `${data.shares.length} shared` : undefined,
    totals.votes ? plural(totals.votes, 'vote') : undefined,
    totals.comments ? plural(totals.comments, 'comment') : undefined,
    profile.followers ? `${compact(profile.followers)} followers on Bluesky` : undefined,
  ].filter(Boolean)

  return (
    <header className="px-3 pt-3 md:px-4 md:pt-4">
      <div className="rounded-[18px] bg-panel p-4 md:p-5">
        <div className="flex items-start gap-3.5">
          {profile.avatar ? (
            <img src={profile.avatar} alt="" referrerPolicy="no-referrer" className="size-16 flex-none rounded-full bg-sunk object-cover" />
          ) : (
            <span className="grid size-16 flex-none place-items-center rounded-full bg-sunk text-[1.5rem] font-bold text-ink-3">{profile.handle[0]?.toUpperCase()}</span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.375rem] font-bold leading-tight tracking-[-0.01em] [overflow-wrap:anywhere]">{profile.name ?? `@${profile.handle}`}</h1>
            {profile.name && <p className="truncate text-[0.875rem] text-ink-3">@{profile.handle}</p>}
            <p className="mt-1 text-[0.8125rem] text-ink-3">{stats.join(' · ')}</p>
          </div>
        </div>
        {profile.bio && <p className="mt-3 line-clamp-4 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-2 [overflow-wrap:anywhere]">{profile.bio}</p>}
        <div className="mt-3.5 flex flex-wrap gap-2">
          {mine ? (
            <>
              {/* Your name, picture and bio are your Bluesky profile's: edited there, shown here. */}
              <a className="btn btn-primary h-9 text-[0.8125rem]" href={`https://bsky.app/profile/${profile.handle}`} target="_blank" rel="noopener noreferrer">
                <Pencil size={14} /> Edit on Bluesky
              </a>
            </>
          ) : (
            <>
              <button className={`btn h-9 text-[0.8125rem] ${following ? 'following' : 'btn-primary'}`} onClick={toggle} aria-pressed={following}>
                {following ? <Check size={14} /> : <Plus size={14} />} {following ? 'Following' : 'Follow'}
              </button>
              <a className="btn h-9 text-[0.8125rem]" href={`https://bsky.app/profile/${profile.handle}`} target="_blank" rel="noopener noreferrer">
                <SourceIcon source="bluesky" size={14} /> Bluesky <ExternalLink size={12} />
              </a>
            </>
          )}
          <button className="btn h-9 text-[0.8125rem]" onClick={() => void share(`${profile.name ?? `@${profile.handle}`} on PaperWing`, `${homeOrigin()}${profilePath(profile.handle)}`)}>
            <Share2 size={14} /> Share
          </button>
          <RssButton path={`/rss/u/${encodeURIComponent(profile.handle)}`} label="RSS" className="btn h-9 text-[0.8125rem]" />
        </div>
        {mine && (
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-3">
            {totals.listed ? 'To list another story' : 'To list your first story'}: open it, tap Share (the paper plane) under the title, and tick “List it on PaperWing”. It shows up here and on the
            front page.
          </p>
        )}
        {mixes.length > 0 && (
          <div className="mt-4">
            <p className="text-[0.8125rem] font-semibold text-ink-3">Mixes</p>
            <div className="scroll-x -mx-4 mt-2 flex gap-2 px-4 md:-mx-5 md:px-5">
              {mixes.map((m) => (
                <Link key={m.uri} to={`/mix/${profile.did}/${m.rkey}`} className="w-56 flex-none rounded-xl bg-sunk px-3.5 py-2.5 hover:bg-line">
                  <span className="flex items-center gap-1.5 text-[0.9375rem] font-semibold">
                    <Layers size={14} className="flex-none text-ink-3" />
                    <span className="truncate">{m.name}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[0.8125rem] text-ink-3">{m.description ?? plural(m.sources, 'source')}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
