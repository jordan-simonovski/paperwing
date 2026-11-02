import { Check, ExternalLink, Loader2, Send, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { shareTargets, useAccounts } from '../lib/accounts'
import { canWrite, useAtproto } from '../lib/atproto'
import { blueskyText, mastodonText, SHARE_LIMITS, shareLink, shareStory, type ShareNetwork, type ShareResult } from '../lib/compose'
import { domainOf } from '../lib/format'
import { graphemes } from '../lib/facets'
import { usePrefs } from '../lib/store'
import { SUBMISSION_NSID } from '../lib/paperwing'
import { topicsForStory, TOPICS } from '../lib/topics'
import type { Story } from '../lib/types'
import { toast } from '../lib/ui'
import { BoardPicker, useBoardShut } from './BoardPicker'
import { Sheet } from './Sheet'
import { SourceIcon } from './SourceIcon'

// One sheet for sharing a story anywhere you're signed in: Bluesky (and with it PaperWing, which is
// a Bluesky post listed on a board), Hacker News and Mastodon. One title, one take, a tick per place.

const NAMES: Record<ShareNetwork, string> = { bluesky: 'Bluesky', hn: 'Hacker News', mastodon: 'Mastodon', lemmy: 'Lemmy' }

function Count({ used, limit }: { used: number; limit: number }) {
  return <span className={`num text-[0.75rem] ${used > limit ? 'font-semibold text-signal' : 'text-ink-3'}`}>{limit - used}</span>
}

export function ShareSheet({ story, board: given, onClose }: { story: Story; board?: string; onClose: () => void }) {
  const accounts = useAccounts()
  const bsky = !!accounts.bluesky
  const lemmy = !!accounts.lemmy
  const canList = useAtproto((a) => canWrite(a.scope, SUBMISSION_NSID) !== false)
  const communities = usePrefs((p) => p.communities)
  const link = shareLink(story) ?? ''

  const [title, setTitle] = useState(story.title)
  const [take, setTake] = useState('')
  const [board, setBoard] = useState(() => given ?? topicsForStory(story).find((t) => TOPICS.some((x) => x.id === t)) ?? '')
  const [paperwing, setPaperwing] = useState(bsky)
  // A community board's listing stays on its board unless you also put it on the front page.
  const [front, setFront] = useState(false)
  const onCommunityBoard = board.startsWith('at://')
  // Only its moderators list on a moderators-only board (every official board is one): the picker says so.
  const { shut } = useBoardShut(board)
  const [to, setTo] = useState<Record<ShareNetwork, boolean>>({ bluesky: bsky, hn: false, mastodon: false, lemmy: false })
  // The community to post in: one of yours, the one whose topic fits best first.
  const [community, setCommunity] = useState(() => communities[0]?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ShareResult[]>()

  const lengths = useMemo(
    () => ({ bluesky: graphemes(blueskyText({ take, title })), mastodon: graphemes(mastodonText({ take, title }, link)), hn: title.trim().length, lemmy: title.trim().length }),
    [take, title, link],
  )
  const chosen = (Object.keys(to) as ShareNetwork[]).filter((n) => to[n])
  const tooLong = chosen.some((n) => lengths[n] > SHARE_LIMITS[n])
  const available = shareTargets(accounts, story, communities.length).map((t) => ({ ...t, id: t.network }))

  const submit = async () => {
    setBusy(true)
    try {
      const out = await shareStory({
        story,
        title,
        take,
        paperwing: to.bluesky && paperwing && !shut,
        board: board || undefined,
        front: onCommunityBoard && front,
        community: community || undefined,
        to: chosen,
      })
      setResults(out)
      const good = out.filter((r) => r.ok).length
      if (good === out.length) toast(good === 1 ? `Shared to ${NAMES[out[0].network]}${out[0].note?.includes('PaperWing') ? ' and PaperWing' : ''}` : `Shared to ${good} places`)
    } catch (err) {
      toast((err as Error).message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} side="bottom" label="Share">
      <div className="space-y-4 p-4">
        <h2 className="text-[1.0625rem] font-bold">Share</h2>
        <div className="rounded-xl bg-sunk px-3.5 py-2.5">
          <p className="truncate text-[0.8125rem] text-ink-3">{domainOf(link) ?? link}</p>
          <input
            className="mt-0.5 w-full bg-transparent text-[0.9375rem] font-semibold focus:outline-none"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Title"
            maxLength={300}
          />
        </div>

        {results ? (
          <div className="space-y-2">
            {results.map((r) => (
              <div key={r.network} className="flex items-center gap-3 rounded-xl bg-sunk px-3.5 py-2.5">
                <SourceIcon source={r.network} size={16} />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.9375rem] font-semibold">{r.ok ? `Shared to ${NAMES[r.network]}` : `${NAMES[r.network]} didn’t take it`}</p>
                  {(r.note || r.error) && <p className={`text-[0.8125rem] ${r.ok ? 'text-ink-3' : 'text-signal'}`}>{r.note ?? r.error}</p>}
                </div>
                {r.url && (
                  <a className="icon-btn flex-none" href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`Open on ${NAMES[r.network]}`}>
                    <ExternalLink size={15} />
                  </a>
                )}
              </div>
            ))}
            <div className="flex justify-end pt-1">
              <button className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <textarea
              className="input min-h-24 resize-y py-2.5 leading-relaxed"
              placeholder="What do you make of it? (optional: without it, the title is the post)"
              value={take}
              onChange={(e) => setTake(e.target.value)}
              aria-label="Your take"
            />

            <fieldset className="space-y-1.5">
              <legend className="mb-1 text-[0.8125rem] font-semibold text-ink-3">Where</legend>
              {available.map((n) => (
                <label key={n.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${n.ok ? 'cursor-pointer hover:bg-sunk' : 'opacity-60'}`}>
                  <input type="checkbox" className="size-4 accent-[var(--ink)]" disabled={!n.ok} checked={n.ok && to[n.id]} onChange={(e) => setTo({ ...to, [n.id]: e.target.checked })} />
                  <SourceIcon source={n.id} size={16} />
                  <span className="flex-1 text-[0.9375rem] font-semibold">{NAMES[n.id]}</span>
                  {n.ok ? (
                    to[n.id] && <Count used={lengths[n.id]} limit={SHARE_LIMITS[n.id]} />
                  ) : (
                    <Link to="/settings/sources" className="text-[0.8125rem] text-ink-3 underline underline-offset-2" onClick={onClose}>
                      {n.why}
                    </Link>
                  )}
                </label>
              ))}
            </fieldset>

            {bsky && to.bluesky && (
              <div className="rounded-xl bg-sunk px-3.5 py-3">
                <label className="flex items-center gap-3">
                  <input type="checkbox" className="size-4 accent-[var(--ink)]" checked={paperwing && canList} disabled={!canList} onChange={(e) => setPaperwing(e.target.checked)} />
                  <span className="flex-1">
                    <span className="block text-[0.9375rem] font-semibold">List it on PaperWing</span>
                    <span className="block text-[0.8125rem] text-ink-3">
                      {canList ? 'Your Bluesky post is listed on PaperWing: likes are its votes, replies its comments.' : 'Needs one more Bluesky permission: Allow under Settings, Sources.'}
                    </span>
                  </span>
                </label>
                {paperwing && canList && (
                  <div className="mt-2.5">
                    <BoardPicker board={board} onBoard={setBoard} front={front} onFront={setFront} />
                  </div>
                )}
              </div>
            )}

            {to.lemmy && lemmy && (
              <div className="rounded-xl bg-sunk px-3.5 py-3">
                <p className="text-[0.9375rem] font-semibold">Lemmy community</p>
                <p className="text-[0.8125rem] text-ink-3">The title is the post’s title (200 characters at most), your take its text.</p>
                <select className="input mt-2.5 h-10" value={community} onChange={(e) => setCommunity(e.target.value)} aria-label="Community">
                  {communities.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.title} (c/{c.name})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-3">
              <span className="flex-1 text-[0.8125rem] text-ink-3">{chosen.length ? `To ${chosen.map((n) => NAMES[n]).join(', ')}` : 'Pick at least one place'}</span>
              <button type="button" className="btn" onClick={onClose}>
                <X size={15} /> Cancel
              </button>
              <button className="btn btn-primary" disabled={busy || !chosen.length || tooLong || !title.trim()} onClick={() => void submit()}>
                {busy ? <Loader2 size={15} className="spin" /> : chosen.length > 1 ? <Check size={15} /> : <Send size={15} />} Share
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
