import { useQueryClient } from '@tanstack/react-query'
import { useUnreadRelease } from '../lib/whatsNew'
import {
  Bell,
  Bookmark,
  Bug,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Compass,
  Copy,
  Download,
  FileText,
  GitPullRequest,
  Heart,
  KeyRound,
  Lightbulb,
  Loader2,
  Lock,
  MessageSquare,
  Palette,
  RefreshCw,
  Rss,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { describe, setDiag, useDiag } from '../lib/diag'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { useMediaQuery } from '../lib/hooks'
import { download, exportJson, exportMarkdown, parseImport, toSavedItems } from '../lib/importExport'
import { unpublishBlogroll } from '../lib/blogroll'
import { useAtproto } from '../lib/atproto'
import { profilePath } from '../lib/people'
import { BlogSuggestions, FeedFinder } from '../components/FollowBlogs'
import { FeedList } from '../components/FeedList'
import { OpmlTools } from '../components/OpmlTools'
import { BlueskyAccount } from '../components/BlueskyAccount'
import { SourceIcon } from '../components/SourceIcon'
import { Pip } from '../components/Pip'
import { HnAccount } from '../components/HnAccount'
import { LemmyAccount } from '../components/LemmyAccount'
import { Labelers } from '../components/ModerationSettings'
import { BoardSettings } from '../components/BoardSettings'
import { PostingSettings } from '../components/PostingSettings'
import { BlueskyFeeds } from '../components/BlueskyFeeds'
import { playSplash } from '../lib/splash'
import { MastodonSettings } from '../components/MastodonSettings'
import { ReadingAnimation } from '../components/pretext/ReadingAnimation'
import type { ReaderKind } from '../lib/pretext/actors'
import { usePretext } from '../lib/pretext'
import { SaveFromApps } from '../components/SaveFromApps'
import { StatusPagesSettings } from '../components/StatusPagesSettings'
import { featureLabel } from '../lib/tasteLabel'
import { protectStorage, useLibrary } from '../lib/library'
import { codeFromPasskey, createSyncPasskey, useSyncReadiness } from '../lib/passkey'
import { pushAvailable, pushInfo, usePush } from '../lib/push'
import { alertPages, MAX_ALERT_PAGES, STATUS_PAGES } from '../lib/statusPageList'
import { SummarySettings } from '../components/SummarySettings'
import { formatCode, joinSync, notSyncedText, startSyncWithNewCode, syncNow, useSync } from '../lib/sync'
import { ago, fullDate } from '../lib/format'
import { isIOS, usePWA } from '../lib/pwa'
import { useActivity, usePrefs } from '../lib/store'
import { toast } from '../lib/ui'

function Section({ title, hint, children }: { title?: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="py-3">
      {title && <h2 className="text-[1rem] font-bold">{title}</h2>}
      {hint && <p className="mt-1 text-[0.875rem] leading-snug text-ink-3">{hint}</p>}
      {/* minmax(0, 1fr): a column that can't shrink grows to fit a long unbroken line (a URL, a code) and runs off a phone screen. */}
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-5 rounded-[18px] bg-panel p-5">{children}</div>
    </section>
  )
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-24 text-[0.875rem] font-semibold text-ink-2">{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} role="radio" aria-checked={value === v} aria-pressed={value === v} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

function NotificationSettings() {
  const { subscribed, subscribe, unsubscribe, sendTest, alerts, setAlerts } = usePush()
  const statusPages = usePrefs((p) => p.statusPages)
  const [available, setAvailable] = useState<boolean>()
  const [alertsAt, setAlertsAt] = useState<number>()
  const [scheduler, setScheduler] = useState<boolean>()
  useEffect(() => void pushAvailable().then(setAvailable), [])
  useEffect(() => void pushInfo(true).then((i) => (setAlertsAt(i.alertsAt), setScheduler(i.scheduler))), [])
  if (available === undefined) return <p className="text-[0.9375rem] text-ink-3">Checking…</p>
  if (!available)
    return (
      <p className="text-[0.9375rem] leading-relaxed text-ink-2">
        {'PushManager' in window ? (
          <>
            Notifications aren’t switched on for this copy of PaperWing yet.{' '}
            <span className="text-ink-3">If you run it: add Upstash (Redis, and QStash for the schedules) from the Vercel Marketplace and redeploy; PaperWing sets up everything else itself.</span>
          </>
        ) : (
          <>This browser can't receive notifications. On iPhone and iPad, install PaperWing to your home screen first.</>
        )}
      </p>
    )
  if (!subscribed)
    return (
      <button className="btn" onClick={() => void subscribe()}>
        Turn on notifications
      </button>
    )
  const pages = [...STATUS_PAGES.map((p) => ({ id: p.id, name: p.name })), ...statusPages.map((p) => ({ id: p.host, name: p.name }))]
  // A page you've stopped following doesn't count, and goes from your alerts the next time you pick.
  const current = alertPages.of(
    alerts.incidents,
    pages.map((p) => p.id),
  )
  const picked = new Set(current)
  const full = alertPages.full(current)
  const builtIn = new Set(STATUS_PAGES.map((p) => p.id))
  const minutes = alertsAt ? Math.round((Date.now() - alertsAt) / 60_000) : undefined
  return (
    <>
      <Toggle label="When each day's edition is ready" checked={alerts.edition} onChange={(edition) => setAlerts({ edition })} />
      <Toggle label="New replies in threads you watch" checked={alerts.replies} onChange={(replies) => setAlerts({ replies })} />
      <Toggle label="When people start saying a service is down (Outage watch)" checked={alerts.outages} onChange={(outages) => setAlerts({ outages })} />
      <div>
        <p className="mb-2 text-[0.9375rem] text-ink-2">Major and critical incidents from:</p>
        <div className="flex flex-wrap gap-1.5">
          {pages.map((p) => (
            <button
              key={p.id}
              className={`chip h-8 px-3 ${picked.has(p.id) ? 'on' : ''}`}
              aria-pressed={picked.has(p.id)}
              disabled={full && !picked.has(p.id) && !builtIn.has(p.id)}
              onClick={() => setAlerts({ incidents: picked.has(p.id) ? current.filter((x) => x !== p.id) : [...current, p.id] })}
            >
              {picked.has(p.id) && <Check size={13} />}
              {p.name}
            </button>
          ))}
        </div>
        {full && <p className="mt-2 text-[0.8125rem] text-ink-3">Alerts take up to {MAX_ALERT_PAGES} of the status pages you follow yourself. Unpick one to choose another.</p>}
      </div>
      <p className="text-[0.8125rem] leading-relaxed text-ink-3">
        {minutes === undefined
          ? scheduler
            ? 'PaperWing checks for replies, incidents and outages every five minutes; the first check runs within a few minutes of turning one on.'
            : 'For now only the daily edition arrives here: alerts for replies, incidents and outages aren’t switched on for this copy of PaperWing. (If you run it: add Upstash QStash from the Vercel Marketplace and redeploy.)'
          : minutes < 30
            ? `Checked every few minutes; the last check was ${minutes < 1 ? 'just now' : `${minutes} min ago`}. The app icon counts what's new since you last opened PaperWing.`
            : `The last check was ${ago(alertsAt!)}, so the schedule may have stopped (README: Alerts).`}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button className="btn" onClick={() => void sendTest()}>
          Send a test
        </button>
        <button className="text-[0.875rem] font-semibold text-ink-3 underline decoration-[var(--line-strong)] underline-offset-4 hover:text-ink" onClick={() => void unsubscribe()}>
          Turn off notifications on this device
        </button>
      </div>
    </>
  )
}

function Diagnostics() {
  const { on, runs } = useDiag()
  const report = runs.map((r) => `${new Date(r.at).toLocaleTimeString()} ${describe(r)}`).join('\n')
  return (
    <>
      <Toggle label="Time going back to the list" checked={on} onChange={setDiag} />
      {runs.length > 0 && (
        <>
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-[var(--r-control)] bg-[var(--sunk)] p-3 font-mono text-[0.75rem] leading-relaxed text-ink-2">{report}</pre>
          <div>
            <button className="btn" onClick={() => void navigator.clipboard.writeText(`${navigator.userAgent}\n${report}`).then(() => toast('Copied'))}>
              Copy timings
            </button>
          </div>
        </>
      )}
    </>
  )
}

/** Whether the browser has promised to keep saved articles through storage cleanups. */
function StorageStatus() {
  const [persisted, setPersisted] = useState<boolean>()
  useEffect(() => void navigator.storage?.persisted?.().then(setPersisted), [])
  if (persisted === undefined) return null
  return persisted ? (
    <p className="text-[0.9375rem] text-ink-2">Your saved articles are protected: this browser won't clear them to free up space.</p>
  ) : (
    <div className="flex flex-wrap items-center gap-3">
      <p className="flex-1 text-[0.9375rem] text-ink-2">This browser may clear saved articles if storage runs low.</p>
      <button
        className="btn"
        onClick={() => void protectStorage().then((ok) => (setPersisted(ok), toast(ok ? 'Saved articles are protected' : 'This browser declined. Installing PaperWing usually changes that')))}
      >
        Protect them
      </button>
    </div>
  )
}

function SyncSettings() {
  const { code, lastSync, error, syncing, passkey, setCode, notSynced } = useSync()
  const tooLarge = notSyncedText(notSynced)
  const { available, passkeys: support } = useSyncReadiness()
  const [busy, setBusy] = useState(false)
  const [joining, setJoining] = useState('')
  const [qr, setQr] = useState<string>()
  const [reveal, setReveal] = useState(false)
  const [manual, setManual] = useState(false)
  const link = code ? `${location.origin}/pair#${code}` : ''
  const showPairing = !passkey || manual

  useEffect(() => {
    if (!link || !showPairing) return setQr(undefined)
    // The QR encoder only loads when someone opens this section with sync on.
    void import('uqr').then(({ renderSVG }) => setQr(renderSVG(link, { blackColor: '#111', whiteColor: '#fff', border: 2 })))
  }, [link, showPairing])

  const withPasskey = async (get: () => Promise<string>, done: string) => {
    setBusy(true)
    try {
      await joinSync(await get(), { passkey: true })
      toast(done)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'The passkey didn’t work', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  const passkeyButtons = (primary: boolean) => (
    <div className="flex flex-wrap gap-2">
      <button className={`btn${primary ? ' btn-primary' : ''}`} disabled={busy} onClick={() => void withPasskey(createSyncPasskey, 'Sync is on. On your other devices, tap Use my sync passkey')}>
        <KeyRound size={15} /> Create a sync passkey
      </button>
      <button className="btn" disabled={busy} onClick={() => void withPasskey(codeFromPasskey, 'This device is now in sync')}>
        Use my sync passkey
      </button>
    </div>
  )

  if (available === undefined || support === undefined) return <p className="text-[0.9375rem] text-ink-3">Checking…</p>
  if (!available)
    return (
      <p className="text-[0.9375rem] leading-relaxed text-ink-2">
        Sync isn’t switched on for this copy of PaperWing yet, so everything stays on this device.{' '}
        <span className="text-ink-3">
          If you run it: add <strong>Upstash Redis</strong> from the Vercel Marketplace (the free tier is plenty) and redeploy. It sets{' '}
          <code className="font-mono text-[0.8125rem]">KV_REST_API_URL</code> and <code className="font-mono text-[0.8125rem]">KV_REST_API_TOKEN</code>, which turn this on.
        </span>
      </p>
    )

  if (!code)
    return (
      <>
        {support !== 'no' && (
          <div className="space-y-3">
            <p className="text-[0.9375rem] leading-relaxed text-ink-2">
              Sync with a passkey. It’s kept with your passwords (iCloud Keychain on Apple devices), so your other devices already have it: no code to copy.
            </p>
            {passkeyButtons(true)}
            <p className="text-[0.8125rem] text-ink-3">On the first device, create one. On every other device, use it.</p>
          </div>
        )}
        <div className={support !== 'no' ? 'space-y-3 border-t border-[var(--line)] pt-5' : 'space-y-3'}>
          {support !== 'no' && <p className="text-[0.875rem] font-semibold text-ink-2">Or with a code, for browsers without passkeys</p>}
          <div>
            <button
              className={`btn${support === 'no' ? ' btn-primary' : ''}`}
              onClick={() =>
                void startSyncWithNewCode().then(
                  () => toast('Sync is on. Pair another device with the code or QR below'),
                  (err: Error) => toast(err.message, { tone: 'error' }),
                )
              }
            >
              Turn on sync with a code
            </button>
            <p className="mt-2 text-[0.8125rem] text-ink-3">Makes a code for this device. Everything here is uploaded and kept in step from then on.</p>
          </div>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void joinSync(joining).then(
                () => {
                  setJoining('')
                  toast('This device is now in sync')
                },
                (err: Error) => toast(err.message, { tone: 'error' }),
              )
            }}
          >
            <input
              value={joining}
              onChange={(e) => setJoining(e.target.value)}
              placeholder="Or paste a code from another device"
              className="h-10 min-w-0 flex-1 rounded-full bg-sunk px-4 font-mono text-[0.875rem] placeholder:font-sans placeholder:text-ink-3"
              aria-label="Sync code"
            />
            <button className="btn" type="submit">
              Join
            </button>
          </form>
        </div>
      </>
    )

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-[0.9375rem] text-ink-2">
          {syncing ? (
            'Syncing…'
          ) : error ? (
            <span className="font-semibold text-signal">Last sync failed: {error}</span>
          ) : tooLarge ? (
            <span className="font-semibold text-signal">Synced, except {tooLarge}: too large to sync. Fewer feeds or a shorter note brings it under the limit.</span>
          ) : lastSync ? (
            `In sync. Last synced ${ago(lastSync)}`
          ) : (
            'Not synced yet'
          )}
        </p>
        <button className="btn" onClick={() => void syncNow()} disabled={syncing}>
          <RefreshCw size={15} className={syncing ? 'spin' : undefined} /> Sync now
        </button>
      </div>
      <p className="flex items-start gap-2 text-[0.875rem] leading-snug text-ink-3">
        <Lock size={14} className="mt-0.5 flex-none" aria-hidden />
        {passkey ? 'Synced with your passkey. ' : ''}Encrypted on this device before it’s uploaded: the database only holds ciphertext.
      </p>

      {passkey ? (
        <div className="space-y-2">
          <p className="text-[0.9375rem] font-semibold">Add another device</p>
          <p className="text-[0.875rem] text-ink-3">Open Settings, Saved and sync on it and tap Use my sync passkey. On a computer without the passkey, choose your phone when the browser asks.</p>
          {!manual && (
            <button className="text-[0.875rem] font-semibold text-ink-3 underline decoration-[var(--line-strong)] underline-offset-4 hover:text-ink" onClick={() => setManual(true)}>
              Pair without the passkey
            </button>
          )}
        </div>
      ) : (
        support !== 'no' && (
          <div className="space-y-2">
            <p className="text-[0.9375rem] font-semibold">Switch to a passkey</p>
            <p className="text-[0.875rem] text-ink-3">
              Then your other devices join with the passkey instead of this code. This device’s library moves across; on each other device, tap Use my sync passkey.
            </p>
            {passkeyButtons(false)}
          </div>
        )
      )}

      {showPairing && (
        <div className="flex flex-wrap items-start gap-5">
          {qr && <div className="w-36 flex-none overflow-hidden rounded-xl bg-white p-1" dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR code to pair another device" role="img" />}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[0.9375rem] font-semibold">Pair {passkey ? 'with the code' : 'another device'}</p>
            <p className="text-[0.875rem] text-ink-3">
              Scan the code with your phone's camera, or open the link on the other device. Anyone with this link can read and change your library, so keep it to yourself.
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="btn" onClick={() => void navigator.clipboard.writeText(link).then(() => toast('Pairing link copied'))}>
                <Copy size={15} /> Copy link
              </button>
              <button className="btn" onClick={() => setReveal((r) => !r)}>
                {reveal ? 'Hide code' : 'Show code'}
              </button>
            </div>
            {reveal && <p className="select-all font-mono text-[0.9375rem]">{formatCode(code)}</p>}
          </div>
        </div>
      )}
      <button
        className="text-[0.875rem] font-semibold text-ink-3 underline decoration-[var(--line-strong)] underline-offset-4 hover:text-ink"
        onClick={() => {
          setCode(undefined)
          toast('Sync is off on this device. Its library stays here')
        }}
      >
        Stop syncing on this device
      </button>
    </>
  )
}

function TuningList() {
  const { affinity, interests, set } = usePrefs()
  const entries = Object.entries(affinity)
  if (!entries.length) return <p className="text-[0.9375rem] text-ink-3">Nothing yet. Vote stories up or down, save them, or hide them, and the ranking learns what you like.</p>
  // The profile holds hundreds of small weights; the strongest each way say what it has learned.
  const more = entries
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
  const fewer = entries
    .filter(([, v]) => v < 0)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 14)
  const forget = (k: string) => {
    const next = { ...affinity }
    delete next[k]
    set({ affinity: next })
  }
  const list = (title: string, items: [string, number][]) =>
    items.length > 0 && (
      <div>
        <h3 className="mb-2 text-[0.875rem] font-semibold text-ink-3">{title}</h3>
        <ul className="flex flex-wrap gap-1.5">
          {items.map(([k, v]) => {
            const { kind, name } = featureLabel(k, interests)
            return (
              <li key={k} className="chip h-8 gap-1.5 pl-3 pr-1.5" title={`${kind}, weight ${v}`}>
                <span className="text-ink-3">{kind}</span>
                <span className={v > 0 ? 'text-ink' : 'text-ink-2'}>{name}</span>
                <button className="icon-btn h-6 w-6" onClick={() => forget(k)} aria-label={`Forget ${name}`}>
                  <X size={13} />
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    )
  return (
    <>
      {list('More of', more)}
      {list('Less of', fewer)}
      <p className="text-[0.8125rem] text-ink-3">
        Learned from {entries.length} {entries.length === 1 ? 'feature' : 'features'} of the stories you voted on, saved and hid.
      </p>
      <button className="text-[0.875rem] font-semibold text-ink-3 underline decoration-[var(--line-strong)] underline-offset-4 hover:text-ink" onClick={() => set({ affinity: {} })}>
        Reset all tuning
      </button>
    </>
  )
}

function Bookmarklet() {
  const ref = useRef<HTMLAnchorElement>(null)
  // React won't render javascript: URLs, so the bookmarklet's href is set on the element directly.
  useEffect(() => {
    const code = `(()=>{window.open('${location.origin}/share?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank')})()`
    ref.current?.setAttribute('href', `javascript:${code}`)
  }, [])
  return (
    <a ref={ref} className="btn cursor-grab" onClick={(e) => e.preventDefault()} title="Drag me to your bookmarks bar">
      <Bookmark size={15} /> Save to PaperWing
    </a>
  )
}

function SavedTools() {
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const onFile = async (file: File) => {
    setBusy(true)
    try {
      const links = parseImport(await file.text())
      const lib = useLibrary.getState()
      const items = toSavedItems(links, lib.items)
      await lib.putMany(items)
      toast(
        items.length
          ? `Imported ${items.length} ${items.length === 1 ? 'link' : 'links'}${links.length > items.length ? `, ${links.length - items.length} already saved` : ''}`
          : `Nothing new: all ${links.length} links were already saved`,
      )
      void lib.hydrate()
    } catch (err) {
      toast(`Couldn't read that file: ${err instanceof Error ? err.message : 'unknown format'}`, { tone: 'error' })
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const exportAs = async (kind: 'json' | 'md') => {
    const all = await useLibrary.getState().all()
    const day = new Date().toISOString().slice(0, 10)
    if (kind === 'json') download(`paperwing-saved-${day}.json`, exportJson(all), 'application/json')
    else download(`paperwing-saved-${day}.md`, exportMarkdown(all), 'text/markdown')
  }

  return (
    <>
      <div>
        <p className="mb-2 text-[0.9375rem] font-semibold">Import</p>
        <input ref={input} type="file" accept=".csv,.html,.htm,.json,text/csv,text/html,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
        <button className="btn" disabled={busy} onClick={() => input.current?.click()}>
          <Upload size={15} /> {busy ? 'Importing…' : 'Choose an export file'}
        </button>
        <p className="mt-2 text-[0.8125rem] text-ink-3">Pocket CSV or HTML, Instapaper CSV, Omnivore JSON, a PaperWing export, or any bookmarks file.</p>
      </div>
      <div>
        <p className="mb-2 text-[0.9375rem] font-semibold">Export</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => void exportAs('md')}>
            <Download size={15} /> Markdown
          </button>
          <button className="btn" onClick={() => void exportAs('json')}>
            <Download size={15} /> JSON
          </button>
        </div>
      </div>
      <div>
        <p className="mb-2 text-[0.9375rem] font-semibold">Save from other apps</p>
        <SaveFromApps />
      </div>
      <div className="max-sm:hidden">
        <p className="mb-2 text-[0.9375rem] font-semibold">Save from any page</p>
        <Bookmarklet />
        <p className="mt-2 text-[0.8125rem] text-ink-3">Drag this to your bookmarks bar, then click it on any page to save it.</p>
      </div>
    </>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-[0.9375rem] text-ink-2">
      <input type="checkbox" className="h-[1.125rem] w-[1.125rem] accent-[var(--ink)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

/** Editable list of short strings rendered as removable chips. */
function ChipList({ values, onChange, placeholder, normalize = (s) => s.trim() }: { values: string[]; onChange: (v: string[]) => void; placeholder: string; normalize?: (s: string) => string }) {
  const [draft, setDraft] = useState('')
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="chip on pr-1">
            {v}
            <button className="grid h-5 w-5 place-items-center rounded-full hover:bg-sunk" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <form
        className="mt-2.5 flex max-w-sm gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const v = normalize(draft)
          if (v && !values.includes(v)) onChange([...values, v])
          setDraft('')
        }}
      >
        <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} />
        <button className="btn h-9">Add</button>
      </form>
    </div>
  )
}

function AppearanceSettings() {
  const p = usePrefs()
  const calm = useMediaQuery('(prefers-reduced-motion: reduce)')
  return (
    <>
      <Section hint="Stored on this device.">
        <Segmented
          label="Theme"
          value={p.theme}
          onChange={(theme) => p.set({ theme })}
          options={[
            ['system', 'System'],
            ['light', 'Light'],
            ['dark', 'Dark'],
          ]}
        />
        <Segmented
          label="Text size"
          value={p.textSize}
          onChange={(textSize) => p.set({ textSize })}
          options={[
            ['sm', 'Small'],
            ['md', 'Medium'],
            ['lg', 'Large'],
          ]}
        />
        <Segmented
          label="Density"
          value={p.density}
          onChange={(density) => p.set({ density })}
          options={[
            ['comfortable', 'Comfortable'],
            ['compact', 'Compact'],
          ]}
        />
        <Toggle label="Show excerpts for papers, blogs and repos" checked={p.showExcerpts} onChange={(showExcerpts) => p.set({ showExcerpts })} />
        <Toggle label="Show thumbnails (off when your browser asks to save data)" checked={p.thumbnails} onChange={(thumbnails) => p.set({ thumbnails })} />
        <Toggle label="Show chillies, and what discussions are like" checked={p.spice} onChange={(spice) => p.set({ spice })} />
        <Toggle label="Fold comments that may spoil a film, show, book or game" checked={p.hideSpoilers} onChange={(hideSpoilers) => p.set({ hideSpoilers })} />
        <Toggle label="Colour comment threads by reply depth" checked={p.threadColours} onChange={(threadColours) => p.set({ threadColours })} />
        <Toggle label="Pip dresses up for holidays (Christmas, Halloween, New Year, Valentine's, Easter)" checked={p.seasonal} onChange={(seasonal) => p.set({ seasonal })} />
        <Toggle label="Hide stories I've already opened" checked={p.hideRead} onChange={(hideRead) => p.set({ hideRead })} />
      </Section>
      <Section
        title="Motion"
        hint="Headlines that fly from the feed into the reader and re-wrap on the way, feed headlines that settle in, menus that deal out of their buttons, the launch splash, and Pip reading along while Claude summarises. Laid out with Pretext."
      >
        <Toggle label="Pretext motion" checked={p.pretext} onChange={(pretext) => p.set({ pretext })} />
        {p.pretext && <Toggle label="Animate feed headlines when a feed loads or re-sorts" checked={p.feedMotion} onChange={(feedMotion) => p.set({ feedMotion })} />}
        {p.pretext && (
          <button className="btn w-fit" onClick={() => void playSplash({ force: true })}>
            Replay the launch animation
          </button>
        )}
        {calm && <p className="text-[0.8125rem] text-ink-3">Off while your system asks for reduced motion.</p>}
      </Section>
    </>
  )
}

function NotificationsPage() {
  return (
    <Section hint="Your daily edition, replies in threads you watch, major incidents from the providers you rely on, and early outage chatter. Each device chooses its own.">
      <NotificationSettings />
    </Section>
  )
}

/** Your feeds as a public blogroll on your PaperWing profile: off unless you turn it on. */
function BlogrollToggle() {
  const on = usePrefs((p) => p.blogrollPublic)
  const set = usePrefs((p) => p.set)
  const handle = useAtproto((a) => a.handle)
  if (!handle) return <p className="pt-1 text-[0.8125rem] text-ink-3">Sign in with Bluesky to show these on your PaperWing profile as a blogroll.</p>
  return (
    <div className="pt-1">
      <Toggle
        checked={on}
        label="Show these on my profile as a blogroll"
        onChange={(v) => {
          set({ blogrollPublic: v })
          if (!v)
            void unpublishBlogroll().then(
              () => toast('Your blogroll is off your profile'),
              () => {},
            )
          else toast('Your blogroll will be on your profile in a moment')
        }}
      />
      <p className="mt-1 text-[0.8125rem] text-ink-3">
        Public, on{' '}
        <Link to={profilePath(handle)} className="underline underline-offset-2">
          your profile
        </Link>
        , so others can find blogs through you. It updates as you follow and unfollow.
      </p>
    </div>
  )
}

function SourcesSettings() {
  const p = usePrefs()
  return (
    <>
      <Section
        title="Lemmy account"
        hint="Sign in to vote and comment on Lemmy threads, share stories to a community, and keep the communities you join in step with your account. Reading never needs it."
      >
        <LemmyAccount />
      </Section>
      <Section title="Hacker News account" hint="Sign in to upvote and comment on Hacker News threads. Reading never needs it.">
        <HnAccount />
      </Section>
      <Section title="Bluesky account" hint="Sign in to reply and like on Bluesky threads, post a story to Bluesky, and vote and comment on Frontpage. Reading never needs it.">
        <BlueskyAccount />
      </Section>
      <Section title="Posting" hint="When you post to PaperWing or Bluesky from here. Your choice syncs.">
        <PostingSettings />
      </Section>
      <Section
        title="Bluesky feeds and lists"
        hint="Any custom feed or list, as its own channel: paste its bsky.app link. Feeds keep their own order; lists are ranked like the rest. No sign-in needed."
      >
        <BlueskyFeeds />
      </Section>
      <Section title="Mastodon" hint="Hachyderm's tech trends and the hashtags behind your topics, plus the people you follow once you sign in.">
        <MastodonSettings />
      </Section>
      <Section title="Blogs you keep reading" hint="Sites you've opened three or more stories from lately that you don't follow yet. Following one puts its new posts in Blogs.">
        <BlogSuggestions />
      </Section>
      <Section
        title="Your feeds"
        hint="Paste a blog's address, one of its posts, or its feed, and follow what it publishes. These show up in Blogs. In the reader, a Follow button appears beside a story whose blog has a feed."
      >
        <FeedList />
        <FeedFinder />
        <OpmlTools />
        <BlogrollToggle />
      </Section>
      <Section title="Releases you follow" hint="New versions show up in Releases, alongside the projects your topics already track. Paste owner/name or a GitHub link.">
        <ChipList
          values={p.releaseRepos}
          onChange={(releaseRepos) => p.set({ releaseRepos })}
          placeholder="e.g. tailscale/tailscale"
          normalize={(v) =>
            v
              .trim()
              .replace(/^https?:\/\/github\.com\//, '')
              .replace(/\/(releases.*)?$/, '')
              .replace(/\.git$/, '')
          }
        />
      </Section>
      <Section
        title="Status pages you follow"
        hint="Incidents from these join the Status channel and SRE, alongside the 23 built in. Paste a status page address; pages on Atlassian Statuspage or incident.io work."
      >
        <StatusPagesSettings />
      </Section>
      <Section title="About sources">
        <p className="text-sm leading-relaxed text-ink-2">
          Hacker News, dev.to, Lemmy (through programming.dev) and Mastodon are fetched straight from your browser. Lobsters, arXiv, Hugging Face papers, GitHub, RSS and the reader view go through
          small cached functions on the server. Bluesky comes from PaperWing's own feed generator. Reddit isn't included: it closed its API to new apps and blocks anonymous access.
        </p>
      </Section>
    </>
  )
}

function TuningSettings() {
  const p = usePrefs()
  return (
    <>
      <Section
        title="Feed order"
        hint="How feeds open. Ranked weighs engagement, freshness and your taste; Latest is a plain timeline, newest first, from every source’s newest posts. Either is one tap away at the top of any feed."
      >
        <Segmented
          label="Feed order"
          value={p.feedOrder}
          options={[
            ['ranked', 'Ranked'],
            ['latest', 'Latest'],
          ]}
          onChange={(feedOrder) => p.set({ feedOrder })}
        />
      </Section>
      <Section title="Tuning" hint="What PaperWing has learned from your votes, saves and hides: topics, sites, authors, formats and keywords. It ranks stories up or down; nothing is hidden.">
        <TuningList />
      </Section>
      <Section title="Muting" hint="Stories whose title contains a word, or that link to a domain, never show up. Comments with a muted word are folded away.">
        <ChipList values={p.mutedWords} onChange={(mutedWords) => p.set({ mutedWords })} placeholder="Word or phrase" />
        <ChipList
          values={p.mutedDomains}
          onChange={(mutedDomains) => p.set({ mutedDomains })}
          placeholder="example.com"
          normalize={(s) =>
            s
              .trim()
              .toLowerCase()
              .replace(/^https?:\/\//, '')
              .replace(/^www\./, '')
              .split('/')[0]
          }
        />
      </Section>
      <Section
        title="Content warnings"
        hint="Posts flagged by their authors (Mastodon content warnings, Bluesky self-labels) or by moderation labels: graphic media, nudity and the like. Bluesky’s own moderation always applies."
      >
        <Segmented
          label="Flagged posts"
          value={p.warnings}
          onChange={(warnings) => p.set({ warnings })}
          options={[
            ['blur', 'Cover'],
            ['show', 'Show'],
            ['hide', 'Hide'],
          ]}
        />
      </Section>
      <Section title="Boards and announcements" hint="What For you shows from PaperWing’s community boards. Your choices sync.">
        <BoardSettings />
      </Section>
      <Section
        title="Labelers"
        hint="Independent moderation services on Bluesky: subscribe to one and its labels apply to Bluesky posts and replies here. Each label can hide, warn or do nothing. Your choices sync."
      >
        <Labelers />
      </Section>
    </>
  )
}

function LibrarySettings() {
  return (
    <>
      <Section title="Sync" hint="Your queue, archive, topics, interests, feeds and mutes on every device, encrypted. No account: a passkey, or a private code the devices share.">
        <SyncSettings />
      </Section>
      <Section title="Saved stories" hint="Bring your reading list from Pocket, Instapaper or Omnivore, or take it with you. Imported links download in the background, newest first.">
        <SavedTools />
      </Section>
    </>
  )
}

function SummariesPage() {
  return (
    <>
      <Section hint="Claude can sum up a story's discussion across HN, Lobsters, Lemmy, Bluesky and Mastodon: the themes, the disagreements, the comments worth reading.">
        <SummarySettings />
      </Section>
      <Section title="While Claude reads" hint="What keeps you company while a summary is on its way. The discussion's own words flow around it.">
        <ReaderPicker />
      </Section>
    </>
  )
}

const READERS: { id: ReaderKind | 'plain'; label: string }[] = [
  { id: 'mascot', label: 'Mascot' },
  { id: 'bounce', label: 'Bouncing logo' },
  { id: 'orb', label: 'Orb' },
  { id: 'plain', label: 'Plain spinner' },
]
const PREVIEW_TEXT =
  'Claude reads the top of the discussion and pulls out the themes, the arguments and the comments worth reading, with links back to each one. The words make room for whatever is keeping you company while it works. '

function ReaderPicker() {
  const loader = usePrefs((p) => p.summaryLoader)
  const set = usePrefs((p) => p.set)
  const pretext = usePretext()
  return (
    <>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="While Claude reads">
        {READERS.map((r) => (
          <button key={r.id} role="radio" aria-checked={loader === r.id} className={`chip h-8 px-3 ${loader === r.id ? 'on' : ''}`} onClick={() => set({ summaryLoader: r.id })}>
            {loader === r.id && <Check size={13} />}
            {r.label}
          </button>
        ))}
      </div>
      {!pretext ? (
        <p className="text-[0.8125rem] text-ink-3">Pretext motion is off (Appearance), so summaries show the plain spinner.</p>
      ) : loader === 'plain' ? (
        <p className="flex items-center gap-2 text-[0.9375rem] text-ink-2">
          <Loader2 size={16} className="spin" /> Reading comments…
        </p>
      ) : (
        <div className="summary-card">
          <ReadingAnimation text={PREVIEW_TEXT} kind={loader} />
        </div>
      )}
    </>
  )
}

function AppSettings() {
  const hidden = useActivity((s) => s.hidden)
  const qc = useQueryClient()
  const { installEvent, standalone, install } = usePWA()
  return (
    <>
      <Section title="App" hint="Install PaperWing to get its own window, a home screen icon, offline reading and share-to-PaperWing.">
        {standalone ? (
          <p className="text-sm text-ink-2">Installed. You're running PaperWing as an app.</p>
        ) : installEvent ? (
          <button className="btn btn-primary" onClick={() => void install()}>
            Install PaperWing
          </button>
        ) : isIOS() ? (
          <p className="text-sm leading-relaxed text-ink-2">
            In Safari, tap <strong>Share</strong> then <strong>Add to Home Screen</strong>.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-ink-2">Use your browser's install option (the install icon in the address bar, or the menu's “Install app” / “Add to Home Screen”).</p>
        )}
      </Section>
      <Section title="Data" hint="Saved articles are kept until you remove them. Cached feeds expire after three days.">
        <StorageStatus />
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => (useActivity.setState({ read: {}, visits: {} }), toast('Read history cleared'))}>
            Clear read history
          </button>
          <button className="btn" disabled={!Object.keys(hidden).length} onClick={() => (useActivity.setState({ hidden: {} }), toast('Hidden stories restored'))}>
            Unhide {Object.keys(hidden).length} stories
          </button>
          <button className="btn" onClick={() => (qc.clear(), toast('Feed cache cleared'))}>
            Clear feed cache
          </button>
        </div>
      </Section>
      <Section title="Diagnostics" hint="For tracking down slowness on a phone. Each time you go back to the list, PaperWing times it and shows where the time went.">
        <Diagnostics />
      </Section>
      <Section title="About">
        <About />
      </Section>
    </>
  )
}

interface SettingsSection {
  id: string
  title: string
  blurb: string
  icon: React.ReactNode
  Page: () => React.ReactNode
}

const SECTIONS: SettingsSection[] = [
  { id: 'appearance', title: 'Appearance', blurb: 'Theme, text size and density', icon: <Palette size={17} />, Page: AppearanceSettings },
  { id: 'notifications', title: 'Notifications', blurb: 'Edition, replies, incidents, outages', icon: <Bell size={17} />, Page: NotificationsPage },
  { id: 'sources', title: 'Sources', blurb: 'Accounts, feeds, releases, status pages', icon: <Rss size={17} />, Page: SourcesSettings },
  { id: 'tuning', title: 'Tuning and moderation', blurb: 'What it has learned, mutes, warnings, labelers', icon: <SlidersHorizontal size={17} />, Page: TuningSettings },
  { id: 'library', title: 'Saved and sync', blurb: 'Sync, import, export, save from apps', icon: <Bookmark size={17} />, Page: LibrarySettings },
  { id: 'summaries', title: 'Discussion summaries', blurb: 'Claude sums up a story’s discussion', icon: <Sparkles size={17} />, Page: SummariesPage },
  { id: 'app', title: 'App and data', blurb: 'Install, storage, diagnostics and about', icon: <Smartphone size={17} />, Page: AppSettings },
]

/** The version you're on, when it was built, and what's in it (marked while you haven't looked). */
function BuildInfo() {
  const unread = useUnreadRelease()
  return (
    <p className="meta">
      <span className="num">Version {__BUILD__.version}</span>
      <span>{fullDate(Date.parse(__BUILD__.at))}</span>
      <Link to="/whats-new" className="font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline">
        What’s new
      </Link>
      {unread && <span className="-ml-3 inline-block size-2 self-center rounded-full bg-signal" aria-label="New release" />}
    </p>
  )
}

/** PaperWing's own Bluesky account: news of the app, and where to say hello. */
const BLUESKY = 'https://bsky.app/profile/paperwing.io'
const FEEDBACK = `https://bsky.app/intent/compose?text=${encodeURIComponent('@paperwing.io ')}`
const REPO = 'https://github.com/paperwingio/paperwing'
/** Tips that keep the servers running: free to use, and supported by the people who read it. */
const SUPPORT = 'https://ko-fi.com/jordo92'
/** A new bug report with the build and device filled in, so nobody has to go looking for them. */
const bugReportUrl = () => {
  const installed = window.matchMedia('(display-mode: standalone)').matches
  const params = new URLSearchParams({
    template: 'bug_report.yml',
    build: `${__BUILD__.version} (built ${__BUILD__.at.slice(0, 10)})`,
    device: `${installed ? 'Installed app' : 'Browser'}, ${navigator.userAgent}`,
  })
  return `${REPO}/issues/new?${params}`
}

function FollowLink({ className = '' }: { className?: string }) {
  return (
    <a className={`inline-flex items-center gap-1.5 font-semibold text-ink underline-offset-2 hover:underline ${className}`} href={BLUESKY} target="_blank" rel="noopener noreferrer">
      <SourceIcon source="bluesky" size={14} /> @paperwing.io
    </a>
  )
}

function About() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
      <Pip variant="head" className="size-12 flex-none sm:size-14" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-[0.9375rem] leading-relaxed text-ink-2">
          PaperWing reads the open web for you: news, communities and conversations, organised by topic. It keeps what it learns about you on your devices, and posts only where you ask it to.
        </p>
        <div className="flex flex-wrap gap-2">
          <a className="btn inline-flex h-9 px-3.5 text-[0.8125rem]" href={BLUESKY} target="_blank" rel="noopener noreferrer">
            <SourceIcon source="bluesky" size={14} /> Follow @paperwing.io
          </a>
          {/* Feedback lands as a public mention on Bluesky; bugs and ideas as GitHub issues. */}
          <a className="btn inline-flex h-9 px-3.5 text-[0.8125rem]" href={FEEDBACK} target="_blank" rel="noopener noreferrer">
            <MessageSquare size={14} /> Send feedback
          </a>
          <a className="btn inline-flex h-9 px-3.5 text-[0.8125rem]" href={SUPPORT} target="_blank" rel="noopener noreferrer">
            <Heart size={14} /> Support PaperWing
          </a>
        </div>
        <p className="pt-2 text-[0.8125rem] font-semibold text-ink-3">Open source, on GitHub</p>
        <div className="flex flex-wrap gap-2">
          <a className="btn inline-flex h-9 px-3.5 text-[0.8125rem]" href={bugReportUrl()} target="_blank" rel="noopener noreferrer">
            <Bug size={14} /> Report a bug
          </a>
          <a className="btn inline-flex h-9 px-3.5 text-[0.8125rem]" href={`${REPO}/issues/new?template=feature_request.yml`} target="_blank" rel="noopener noreferrer">
            <Lightbulb size={14} /> Suggest an idea
          </a>
          <a className="btn inline-flex h-9 px-3.5 text-[0.8125rem]" href={`${REPO}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener noreferrer">
            <GitPullRequest size={14} /> Contribute
          </a>
          <a className="btn inline-flex h-9 px-3.5 text-[0.8125rem]" href={REPO} target="_blank" rel="noopener noreferrer">
            <Code2 size={14} /> Source code
          </a>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link className="btn inline-flex h-9 px-3.5 text-[0.8125rem]" to="/principles">
            <Compass size={14} /> Our principles
          </Link>
          <Link className="btn inline-flex h-9 px-3.5 text-[0.8125rem]" to="/privacy">
            <Shield size={14} /> Privacy
          </Link>
          <Link className="btn inline-flex h-9 px-3.5 text-[0.8125rem]" to="/terms">
            <FileText size={14} /> Terms
          </Link>
        </div>
        <BuildInfo />
      </div>
    </div>
  )
}

/** Phones: the list of settings pages. */
function SettingsMenu() {
  return (
    <div className="wide-col">
      <div className="mx-auto max-w-[40rem] px-4 py-6">
        <h1 className="mb-4 text-[1.875rem] font-bold leading-[1.1] tracking-[-0.02em]">Settings</h1>
        <nav className="overflow-hidden rounded-[18px] bg-panel" aria-label="Settings">
          {SECTIONS.map((s) => (
            <Link key={s.id} to={`/settings/${s.id}`} state={{ fromMenu: true }} className="settings-row">
              <span className="settings-icon">{s.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{s.title}</span>
                <span className="block truncate text-[0.8125rem] text-ink-3">{s.blurb}</span>
              </span>
              <ChevronRight size={17} className="flex-none text-ink-3" aria-hidden />
            </Link>
          ))}
        </nav>
        <div className="mt-6 space-y-1.5 text-center">
          <FollowLink className="text-[0.875rem]" />
          <BuildInfo />
        </div>
      </div>
    </div>
  )
}

export function SettingsPage() {
  const { section } = useParams()
  const wide = useMediaQuery('(min-width: 768px)')
  const navigate = useNavigate()
  const location = useLocation()
  const current = SECTIONS.find((s) => s.id === section)

  useEffect(() => {
    document.title = current ? `${current.title} – Settings – PaperWing` : 'Settings – PaperWing'
  }, [current])

  if (section && !current) return <Navigate to="/settings" replace />
  if (!wide && !current) return <SettingsMenu />
  const shown = current ?? SECTIONS[0]

  // Came from the menu: step back to it rather than stacking another copy in history.
  const back = () => ((location.state as { fromMenu?: boolean } | null)?.fromMenu ? navigate(-1) : navigate('/settings', { replace: true }))

  return (
    <div className="wide-col">
      <div className="mx-auto max-w-[64rem] px-4 py-6 md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10 md:px-8 md:py-8">
        {wide && (
          <nav className="sticky top-8 self-start" aria-label="Settings">
            <h1 className="mb-4 text-[1.5rem] font-bold leading-[1.1] tracking-[-0.02em]">Settings</h1>
            <ul className="space-y-0.5">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <Link to={`/settings/${s.id}`} replace className="settings-nav" aria-current={s.id === shown.id ? 'page' : undefined}>
                    {s.icon}
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6 space-y-1.5 px-3">
              <FollowLink className="text-[0.875rem]" />
              <BuildInfo />
            </div>
          </nav>
        )}
        <div className="min-w-0">
          {!wide && (
            <button className="-ml-2 mb-2 flex h-9 items-center gap-1 rounded-full px-2 text-[0.9375rem] font-semibold text-ink-2" onClick={back}>
              <ChevronLeft size={18} aria-hidden />
              Settings
            </button>
          )}
          <h2 className="text-[1.5rem] font-bold leading-[1.15] tracking-[-0.015em] md:pt-1">{shown.title}</h2>
          <shown.Page key={shown.id} />
        </div>
      </div>
    </div>
  )
}
