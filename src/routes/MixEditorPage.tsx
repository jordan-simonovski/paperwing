import { Check, Copy, Loader2, Lock, Plus, Search, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { publisherRef } from '../lib/publishers'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useAtproto } from '../lib/atproto'
import { findTopic } from '../lib/channels'
import { findFeeds } from '../lib/follow'
import { afterPublishing, deleteMix, mixChannel, newMix, publishMix, removeFeed, saveMix, shareLink, unpublishMix } from '../lib/mixes'
import { plural } from '../lib/format'
import { isPublicSource, MAX_SOURCES, sourceLabel, type MixSource } from '../lib/mixSources'
import { usePrefs, type Mix } from '../lib/store'
import { TOPICS } from '../lib/topics'
import { toast } from '../lib/ui'

// Building a mix: any topics, publishers, communities, Bluesky feeds and searches in one channel.

const same = (a: MixSource, b: MixSource) => JSON.stringify(a) === JSON.stringify(b)

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`chip h-9 gap-1.5 px-3 text-[0.875rem] ${on ? 'following font-semibold' : ''}`} aria-pressed={on} onClick={onClick}>
      {on ? <Check size={14} /> : <Plus size={14} />}
      {children}
    </button>
  )
}

function Group({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="text-[0.9375rem] font-bold">{title}</h3>
      {hint && <p className="mt-0.5 text-[0.8125rem] text-ink-3">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </section>
  )
}

function Editor({ initial }: { initial: Mix }) {
  const navigate = useNavigate()
  const prefs = usePrefs()
  const signedIn = useAtproto((s) => !!s.did)
  const [mix, setMix] = useState(initial)
  // Private feeds stay in your copy but out of what's published.
  const hidden = mix.sources.filter((s) => !isPublicSource(s)).length
  const [busy, setBusy] = useState<string>()
  const [site, setSite] = useState('')
  const [search, setSearch] = useState('')
  const [allTopics, setAllTopics] = useState(false)

  const has = (s: MixSource) => mix.sources.some((x) => same(x, s))
  const toggle = (s: MixSource) => {
    if (!has(s) && mix.sources.length >= MAX_SOURCES) return toast(`A mix holds up to ${MAX_SOURCES} sources`, { tone: 'error' })
    setMix((m) => ({ ...m, sources: has(s) ? m.sources.filter((x) => !same(x, s)) : [...m.sources, s] }))
  }
  /** Runs one action, saying what went wrong if it fails. True when it worked. */
  const run = async (label: string, job: () => Promise<Mix | void>) => {
    setBusy(label)
    try {
      const next = await job()
      if (next) setMix((m) => afterPublishing(m, next))
      return true
    } catch (err) {
      toast((err as Error).message, { tone: 'error' })
      return false
    } finally {
      setBusy(undefined)
    }
  }
  const save = () =>
    run('save', async () => {
      const saved = saveMix(mix)
      // A published mix is republished on save, so followers see the edit.
      const next = saved.published ? await publishMix(saved) : saved
      toast(saved.published ? 'Saved and republished' : 'Saved')
      return next
    })

  const followedTopics = prefs.followed.map((id) => findTopic(id, prefs.interests)).filter((t) => !!t && !t.id.startsWith('q:'))
  const topicChoices = allTopics ? TOPICS : TOPICS.filter((t) => followedTopics.some((f) => f!.id === t.id))

  return (
    <div className="wide-col">
      <div className="mx-auto max-w-[48rem] px-4 pb-24 pt-8 md:px-8">
        <label htmlFor="mix-name" className="text-[0.8125rem] font-semibold text-ink-3">
          Mix name
        </label>
        <input
          className="mt-1 w-full border-b-2 border-line bg-transparent pb-1 text-[1.875rem] font-bold leading-tight tracking-[-0.02em] placeholder:text-ink-3 focus:border-ink focus:outline-none"
          value={mix.name}
          maxLength={100}
          placeholder="Name your mix"
          onChange={(e) => setMix({ ...mix, name: e.target.value })}
          id="mix-name"
        />
        <textarea
          className="input mt-3 min-h-20 resize-y py-2.5"
          maxLength={600}
          placeholder="What it’s for (optional): shown to anyone you share it with"
          value={mix.description ?? ''}
          onChange={(e) => setMix({ ...mix, description: e.target.value || undefined })}
          aria-label="Description"
        />

        <h2 className="mt-8 text-[1.125rem] font-bold">
          In this mix <span className="num font-normal text-ink-3">{mix.sources.length}</span>
        </h2>
        {!mix.sources.length && <p className="mt-2 text-[0.875rem] text-ink-3">Nothing yet: pick from below.</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {mix.sources.map((s) => (
            <span key={JSON.stringify(s)} className="chip following h-9 gap-1.5 pl-3 pr-1.5 text-[0.875rem]">
              {!isPublicSource(s) && <Lock size={13} role="img" aria-label="Private: stays out of the published mix" />}
              {sourceLabel(s)}
              <button type="button" className="icon-btn size-6" onClick={() => toggle(s)} aria-label={`Remove ${sourceLabel(s)}`}>
                <X size={13} />
              </button>
            </span>
          ))}
        </div>

        <Group
          title="Topics"
          hint={
            <>
              {allTopics ? 'Every topic.' : 'Yours.'}{' '}
              <button type="button" className="font-semibold text-ink underline underline-offset-2" onClick={() => setAllTopics(!allTopics)}>
                {allTopics ? 'Show just yours' : 'Show all'}
              </button>
            </>
          }
        >
          {topicChoices.map((t) => (
            <Chip key={t.id} on={has({ kind: 'topic', id: t.id })} onClick={() => toggle({ kind: 'topic', id: t.id })}>
              {t.label}
            </Chip>
          ))}
        </Group>

        {prefs.communities.length > 0 && (
          <Group
            title="Your communities"
            hint={
              <Link className="underline underline-offset-2" to="/explore/communities">
                Find more
              </Link>
            }
          >
            {prefs.communities.map((c) => {
              const s: MixSource = { kind: 'lemmy', community: c.name, via: 'lemmy.world' }
              return (
                <Chip key={c.name} on={has(s)} onClick={() => toggle(s)}>
                  {c.title}
                </Chip>
              )
            })}
          </Group>
        )}

        {prefs.bskyFeeds.length > 0 && (
          <Group
            title="Your Bluesky feeds"
            hint={
              <Link className="underline underline-offset-2" to="/explore/feeds">
                Find more
              </Link>
            }
          >
            {prefs.bskyFeeds.map((f) => {
              const s: MixSource = { kind: 'bskyFeed', uri: f.uri, name: f.name }
              return (
                <Chip key={f.uri} on={has(s)} onClick={() => toggle(s)}>
                  {f.name}
                </Chip>
              )
            })}
          </Group>
        )}

        <Group title="Publishers" hint="Paste a blog, Discourse forum or Standard.site publication.">
          {prefs.customFeeds.map((f) => {
            const s: MixSource = publisherRef(f)
            return (
              <Chip key={f.url} on={has(s)} onClick={() => toggle(s)}>
                {f.label}
              </Chip>
            )
          })}
          {mix.sources
            .filter((s): s is Extract<MixSource, { kind: 'rss' | 'standard' }> => (s.kind === 'rss' || s.kind === 'standard') && !prefs.customFeeds.some((f) => f.url === s.url))
            .map((s) => (
              <Chip key={s.url} on onClick={() => toggle(s)}>
                {s.label}
              </Chip>
            ))}
          <form
            className="flex w-full max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!site.trim()) return
              void run('site', async () => {
                const [feed] = await findFeeds(site.trim())
                if (!feed) throw new Error('No feed found there')
                toggle(publisherRef({ ...feed, label: feed.title }))
                setSite('')
              })
            }}
          >
            <input
              className="input"
              inputMode="url"
              autoCapitalize="off"
              placeholder="theconversation.com, a blog, a newsletter"
              value={site}
              onChange={(e) => setSite(e.target.value)}
              aria-label="Site to add"
            />
            <button className="btn h-10 flex-none" disabled={busy === 'site'}>
              {busy === 'site' ? <Loader2 size={15} className="spin" /> : <Search size={15} />} Find
            </button>
          </form>
        </Group>

        <Group title="Searches" hint="Headlines about anything, from any publisher.">
          {mix.sources
            .filter((s): s is Extract<MixSource, { kind: 'news' }> => s.kind === 'news')
            .map((s) => (
              <Chip key={s.q} on onClick={() => toggle(s)}>
                {s.q}
              </Chip>
            ))}
          <form
            className="flex w-full max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (search.trim()) toggle({ kind: 'news', q: search.trim() })
              setSearch('')
            }}
          >
            <input className="input" placeholder="e.g. Matildas, heat pumps, Studio Ghibli" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search to add" />
            <button className="btn h-10 flex-none">Add</button>
          </form>
        </Group>

        <section className="mt-10 rounded-[18px] bg-panel p-5">
          <h2 className="text-[1.0625rem] font-bold">Share it</h2>
          {signedIn && hidden > 0 && (
            <p className="mt-1 text-[0.8125rem] text-ink-3">
              {plural(hidden, 'private feed')} {hidden === 1 ? 'stays' : 'stay'} out of the published mix and its Bluesky feed: {hidden === 1 ? 'its address holds' : 'their addresses hold'} a password
              or token. {hidden === 1 ? 'It stays' : 'They stay'} in your own copy.
            </p>
          )}
          {!signedIn ? (
            <p className="mt-1 text-[0.875rem] text-ink-2">
              Sign in with Bluesky (
              <Link className="underline underline-offset-2" to="/settings/sources">
                Settings, Sources
              </Link>
              ) to publish this mix to your own account. Anyone with the link can then follow it, and it goes wherever your account goes.
            </p>
          ) : mix.published ? (
            <>
              <p className="mt-1 text-[0.875rem] text-ink-2">Published to your account. Anyone with the link can follow it, and saving here updates it for them.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    void navigator.clipboard?.writeText(shareLink(mix.published!))
                    toast('Link copied')
                  }}
                >
                  <Copy size={14} /> Copy link
                </button>
                {mix.feed ? (
                  <button type="button" className="btn" disabled={!!busy} onClick={() => void run('feed', () => removeFeed(mix))}>
                    Remove its Bluesky feed
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    disabled={!!busy}
                    onClick={() => void run('feed', () => publishMix(saveMix(mix), true).then((m) => (toast('It’s now a Bluesky feed on your profile'), m)))}
                  >
                    {busy === 'feed' && <Loader2 size={14} className="spin" />} Also make it a Bluesky feed
                  </button>
                )}
                <button
                  type="button"
                  className="btn"
                  disabled={!!busy}
                  onClick={() => void run('unpublish', () => unpublishMix(mix).then((m) => (toast('Unpublished. It’s still here, just private.'), m)))}
                >
                  Unpublish
                </button>
              </div>
              {mix.feed && (
                <p className="mt-3 text-[0.8125rem] text-ink-3">
                  Its Bluesky feed shows the most-liked Bluesky post sharing each of its stories, plus posts from its Bluesky feeds. Find it on your Bluesky profile under Feeds.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="mt-1 text-[0.875rem] text-ink-2">
                Publishing writes it to your Bluesky account as a PaperWing mix. You can also make it a Bluesky feed that anyone can pin in the Bluesky app.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!!busy || !mix.sources.length}
                  onClick={() => void run('publish', () => publishMix(saveMix(mix)).then((m) => (toast('Published. Copy its link to share it.'), m)))}
                >
                  {busy === 'publish' && <Loader2 size={14} className="spin" />} Publish
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!!busy || !mix.sources.length}
                  onClick={() => void run('publish', () => publishMix(saveMix(mix), true).then((m) => (toast('Published, and it’s a Bluesky feed on your profile'), m)))}
                >
                  Publish as a Bluesky feed too
                </button>
              </div>
            </>
          )}
        </section>

        {/* A solid strip, so what scrolls under the floating Save reads as under it rather than beside it. */}
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5rem)] -mx-2 mt-8 flex items-center gap-2 rounded-full bg-ground/95 p-2 min-[900px]:bottom-4">
          <button type="button" className="btn btn-primary h-11 px-6 shadow-lg" disabled={!!busy || !mix.name.trim()} onClick={() => void save().then((ok) => ok && navigate(`/t/${mixChannel(mix)}`))}>
            {busy === 'save' && <Loader2 size={15} className="spin" />} Save and open
          </button>
          <span className="flex-1" />
          {usePrefs.getState().mixes.some((m) => m.id === mix.id) && (
            <button
              type="button"
              className="btn h-11"
              disabled={!!busy}
              onClick={() =>
                void run('delete', async () => {
                  if (mix.published) await unpublishMix(mix)
                  deleteMix(mix)
                  navigate('/explore/mixes')
                })
              }
            >
              <Trash2 size={15} /> Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function MixEditorPage() {
  const { id } = useParams()
  const mixes = usePrefs((s) => s.mixes)
  const [fresh] = useState(() => newMix(''))
  if (!id || id === 'new') return <Editor initial={fresh} />
  const mix = mixes.find((m) => m.id === id)
  return mix ? <Editor key={mix.id} initial={mix} /> : <Navigate to="/explore/mixes" replace />
}
