import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CouldntReach } from '../components/FeedState'
import { useAtproto } from '../lib/atproto'
import { boardPath, createBlockList, resolveHandles, saveBoard, toggleJoin, useBoard } from '../lib/boards'
import { TOPICS } from '../lib/topics'
import { toast } from '../lib/ui'
import { MAX_MODERATORS } from '../lib/social'

// Making (or editing) a community board: a name, what it's for, its rules, its moderators, and
// optionally a Bluesky moderation list for keeping accounts out. Saved in your own Bluesky account.

export function BoardEditorPage() {
  const { rkey } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const did = useAtproto((a) => a.did)
  const loaded = useBoard(rkey ? (did ?? undefined) : undefined, rkey)
  const existing = loaded.data
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rules, setRules] = useState('')
  const [topic, setTopic] = useState('')
  const [mods, setMods] = useState('')
  const [blockList, setBlockList] = useState(true)
  const [modsOnly, setModsOnly] = useState(false)
  const [noImages, setNoImages] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!existing) return
    setName(existing.name)
    setDescription(existing.description ?? '')
    setRules(existing.rules ?? '')
    setTopic(existing.topic ?? '')
    setMods(
      existing.moderators
        .filter((m) => m !== existing.owner)
        .map((m) => (existing.moderatorHandles[m] ? `@${existing.moderatorHandles[m]}` : m))
        .join(', '),
    )
    setBlockList(!!existing.blockList)
    setModsOnly(!!existing.modsOnly)
    setNoImages(!!existing.noImages)
  }, [existing])

  if (!did)
    return (
      <div className="wide-col grid place-items-center p-10 text-center">
        <div className="max-w-sm">
          <p className="text-[1.125rem] font-bold">Start a community board</p>
          <p className="mt-2 text-[0.9375rem] text-ink-3">A board has its own rules and moderators, and lives in your Bluesky account, so it belongs to you. Sign in with Bluesky to start one.</p>
          <Link to="/settings/sources" className="btn btn-primary mt-5 inline-flex">
            Sign in with Bluesky
          </Link>
        </div>
      </div>
    )

  // Editing waits for the board to load: a blank form saved here would replace it with a new, empty
  // board under the same address, dropping its moderators and its list of accounts kept out.
  if (rkey && !existing)
    return (
      <div className="wide-col grid place-items-center p-10 text-center">
        {loaded.isError ? <CouldntReach what="your board" onRetry={() => void loaded.refetch()} /> : <Loader2 size={22} className="spin text-ink-3" aria-label="Loading your board" />}
      </div>
    )

  const save = async () => {
    setBusy(true)
    try {
      const found = (await resolveHandles(mods.split(/[\s,]+/))).filter((m) => m.did !== did).slice(0, MAX_MODERATORS)
      const moderators = found.map((m) => m.did)
      const handles = Object.fromEntries(found.flatMap((m) => (m.handle ? [[m.did, m.handle]] : [])))
      const list = existing?.blockList ?? (blockList ? await createBlockList(name.trim()) : undefined)
      const uri = await saveBoard(
        qc,
        {
          name: name.trim(),
          description: description.trim() || undefined,
          rules: rules.trim() || undefined,
          topic: topic || undefined,
          moderators,
          blockList: blockList ? list : undefined,
          modsOnly: modsOnly || !!existing?.official,
          noImages,
          createdAt: existing?.createdAt,
        },
        rkey,
        handles,
      )
      if (!existing) toggleJoin({ uri, name: name.trim() }, { explain: false })
      toast(existing ? 'Board updated' : 'Your board is up. Share its link to invite people.')
      navigate(boardPath(uri))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Couldn’t save the board', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wide-col">
      <form
        className="mx-auto max-w-[40rem] space-y-5 px-4 pb-24 pt-8 md:px-8"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) void save()
        }}
      >
        <header>
          <h1 className="text-[1.875rem] font-bold leading-tight tracking-[-0.02em]">{existing ? 'Edit your board' : 'Start a board'}</h1>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
            A space for a community, with its own rules and moderators. It lives in your Bluesky account, so it’s yours: if PaperWing went away, the board and everything listed on it would still
            exist. Votes and comments are Bluesky likes and replies.
          </p>
        </header>
        <label className="block">
          <span className="text-[0.875rem] font-semibold">Name</span>
          <input className="input mt-1.5" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Home Cooking, Rust Melbourne, Open Hardware" required />
        </label>
        <label className="block">
          <span className="text-[0.875rem] font-semibold">What it’s for</span>
          <textarea className="input mt-1.5 min-h-20 resize-y py-2.5" value={description} maxLength={600} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-[0.875rem] font-semibold">Rules</span>
          <textarea
            className="input mt-1.5 min-h-24 resize-y py-2.5"
            value={rules}
            maxLength={2000}
            onChange={(e) => setRules(e.target.value)}
            placeholder="Be kind. Stay on topic. No self-promotion more than once a week."
          />
        </label>
        <label className="block">
          <span className="text-[0.875rem] font-semibold">Topic</span>
          <select className="input mt-1.5 h-10" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">None</option>
            {TOPICS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[0.875rem] font-semibold">Moderators</span>
          <input className="input mt-1.5" value={mods} onChange={(e) => setMods(e.target.value)} placeholder="@friend.bsky.social, @another.example" />
          <span className="mt-1 block text-[0.8125rem] text-ink-3">Bluesky handles, up to {MAX_MODERATORS}. You’re always one. Moderators can hide listings from the board.</span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-[var(--ink)]"
            checked={modsOnly || !!existing?.official}
            disabled={!!existing?.official}
            onChange={(e) => setModsOnly(e.target.checked)}
          />
          <span className="text-[0.9375rem] text-ink-2">
            Only moderators post here. Anyone can still vote and reply.{existing?.official ? ' Always, for an official board.' : ' Good for announcements and curated boards.'}
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 size-4 accent-[var(--ink)]" checked={noImages} onChange={(e) => setNoImages(e.target.checked)} />
          <span className="text-[0.9375rem] text-ink-2">No pictures: words and links only. Posts carrying pictures are left off the board.</span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 size-4 accent-[var(--ink)]" checked={blockList} disabled={!!existing?.blockList} onChange={(e) => setBlockList(e.target.checked)} />
          <span className="text-[0.9375rem] text-ink-2">
            Keep a list of accounts that can’t post here. It’s a Bluesky moderation list in your account, so you can also manage it in Bluesky, and anyone can subscribe to it.
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy && <Loader2 size={15} className="spin" />} {existing ? 'Save' : 'Start the board'}
          </button>
        </div>
      </form>
    </div>
  )
}
