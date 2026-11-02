import { profilePath, useMe } from '../lib/people'
import { Avatar } from './Avatar'
import { Activity, Bell, Layers, Bookmark, CalendarDays, Compass, Download, FileText, FolderGit2, Moon, Newspaper, Rss, Search, Settings, Sparkles, Sun, Tag, WifiOff, X } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { NavLink } from 'react-router'
import { bskyFeedChannel, findTopic, followsTech } from '../lib/channels'
import { mixChannel } from '../lib/mixes'
import { useUnread } from '../lib/inbox'
import { useOnline } from '../lib/hooks'
import { stateOf, useLibrary } from '../lib/library'
import { isWatching, useWatch } from '../lib/watch'
import { usePWA } from '../lib/pwa'
import { usePrefs } from '../lib/store'
import { useUI } from '../lib/ui'
import { Sheet } from './Sheet'
import { PaperwingIcon, SourceIcon } from './SourceIcon'
import { Pip } from './Pip'

function RailLink({ to, icon, children, end }: { to: string; icon: React.ReactNode; children: React.ReactNode; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `rail-link${isActive ? ' active' : ''}`} title={typeof children === 'string' ? children : undefined}>
      <span className="rail-glyph">{icon}</span>
      <span className="rail-label min-w-0 flex-1 truncate">{children}</span>
    </NavLink>
  )
}

/** New replies across watched threads, for the dot on Saved. */
function useFreshReplies() {
  return useWatch((w) => Object.values(w.items).reduce((n, x) => n + (isWatching(x) ? (x.fresh ?? 0) : 0), 0))
}

export function ThemeToggle() {
  const set = usePrefs((s) => s.set)
  const theme = usePrefs((s) => s.theme)
  const dark = theme === 'dark' || (theme === 'system' && document.documentElement.dataset.theme === 'dark')
  return (
    <button className="icon-btn" onClick={() => set({ theme: dark ? 'light' : 'dark' })} title={`${dark ? 'Light' : 'Dark'} mode (t)`} aria-label="Toggle dark mode">
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}

/** The mark: four lines of text, the headline lit. Same drawing as the app icon. */
/** The logo's mark: Pip's head. */
export function Mark() {
  return (
    <span className="mark" aria-hidden>
      <Pip variant="head" className="block size-full" />
    </span>
  )
}

export function Wordmark({ short }: { short?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Mark />
      {!short && <span className="wordmark">PaperWing</span>}
    </span>
  )
}

export function OfflineBadge() {
  const online = useOnline()
  if (online) return null
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-soft px-2.5 py-1 text-[0.8125rem] font-semibold text-ink" title="Showing cached stories and saved articles">
      <WifiOff size={13} /> Offline
    </span>
  )
}

/** Everywhere you can go: the sidebar on wide screens, the drawer on phones. */
function RailLinks({ drawer }: { drawer?: boolean }) {
  const { followed, interests, bskyFeeds, communities, mixes, followedMixes, people } = usePrefs()
  // The collapsed sidebar hides group labels, so groups need a gap of their own there.
  const gap = drawer ? undefined : 'max-[1279px]:mt-5'
  // Hacker News, Lobsters, papers, projects, releases and status pages are tech's own: shown to
  // anyone following tech (or nothing yet), and still a search away for everyone else.
  const tech = followsTech(followed)
  return (
    <>
      <RailLink to="/today" icon={<CalendarDays size={16} />}>
        Today
      </RailLink>
      <RailLink to="/t/for-you" icon={<Sparkles size={16} />}>
        For you
      </RailLink>
      {tech && (
        <RailLink to="/t/front" icon={<Newspaper size={16} />}>
          Front page
        </RailLink>
      )}

      <p className="rail-group rail-label">Your topics</p>
      <div className={gap}>
        {followed.map((id) => {
          const t = findTopic(id, interests)
          if (!t) return null
          return (
            <RailLink key={id} to={`/t/${id}`} icon={<span className="topic swatch" style={{ '--h': t.hue } as React.CSSProperties} />}>
              {t.label}
            </RailLink>
          )
        })}
        <RailLink to="/explore" icon={<Compass size={16} />}>
          Explore
        </RailLink>
      </div>

      <p className="rail-group rail-label">Sources</p>
      <div className={gap}>
        <RailLink to="/t/paperwing" icon={<PaperwingIcon size={16} />}>
          PaperWing
        </RailLink>
        {tech && (
          <>
            <RailLink to="/t/hn" icon={<SourceIcon source="hn" size={16} />}>
              Hacker News
            </RailLink>
            <RailLink to="/t/lobsters" icon={<SourceIcon source="lobsters" size={16} />}>
              Lobsters
            </RailLink>
          </>
        )}
        <RailLink to="/t/bluesky" icon={<SourceIcon source="bluesky" size={16} />}>
          Bluesky
        </RailLink>
        <RailLink to="/t/mastodon" icon={<SourceIcon source="mastodon" size={16} />}>
          Mastodon
        </RailLink>
        <RailLink to="/t/lemmy" icon={<SourceIcon source="lemmy" size={16} />}>
          Lemmy
        </RailLink>
        <RailLink to="/t/frontpage" icon={<SourceIcon source="frontpage" size={16} />}>
          Frontpage
        </RailLink>
        {tech && (
          <>
            <RailLink to="/t/status" icon={<Activity size={16} />}>
              Status
            </RailLink>
            <RailLink to="/t/ml-research" icon={<FileText size={16} />}>
              Papers
            </RailLink>
            <RailLink to="/t/open-source" icon={<FolderGit2 size={16} />}>
              Projects
            </RailLink>
            <RailLink to="/t/releases" icon={<Tag size={16} />}>
              Releases
            </RailLink>
          </>
        )}
        <RailLink to="/t/blogs" icon={<Rss size={16} />}>
          {tech ? 'Blogs' : 'Publishers'}
        </RailLink>
      </div>

      {mixes.length + followedMixes.length > 0 && (
        <>
          <p className="rail-group rail-label">Mixes</p>
          <div className={gap}>
            {[...mixes, ...followedMixes].map((m) => (
              <RailLink key={'id' in m ? m.id : m.uri} to={`/t/${mixChannel(m)}`} icon={<Layers size={16} />}>
                {m.name || 'Untitled mix'}
              </RailLink>
            ))}
          </div>
        </>
      )}

      {people.length > 0 && (
        <>
          <p className="rail-group rail-label">People</p>
          <div className={gap}>
            {people.map((p) => (
              <RailLink
                key={p.did}
                to={profilePath(p.handle)}
                icon={p.avatar ? <img src={p.avatar} alt="" referrerPolicy="no-referrer" className="size-4 rounded-full" loading="lazy" /> : <SourceIcon source="bluesky" size={16} />}
              >
                {p.name ?? `@${p.handle}`}
              </RailLink>
            ))}
          </div>
        </>
      )}

      {communities.length > 0 && (
        <>
          <p className="rail-group rail-label">Communities</p>
          <div className={gap}>
            {communities.map((c) => (
              <RailLink key={c.name} to={`/t/c:${c.name}`} icon={c.icon ? <img src={c.icon} alt="" className="size-4 rounded-full" loading="lazy" /> : <SourceIcon source="lemmy" size={16} />}>
                {c.title}
              </RailLink>
            ))}
          </div>
        </>
      )}

      {bskyFeeds.length > 0 && (
        <>
          <p className="rail-group rail-label">Bluesky feeds</p>
          <div className={gap}>
            {bskyFeeds.map((f) => (
              <RailLink key={f.uri} to={`/t/${bskyFeedChannel(f.uri)}`} icon={<SourceIcon source="bluesky" size={16} />}>
                {f.name}
              </RailLink>
            ))}
          </div>
        </>
      )}
    </>
  )
}

export function Rail() {
  const me = useMe()
  const unread = useUnread()
  const savedCount = useLibrary((s) => Object.values(s.items).filter((m) => stateOf(m) === 'queue').length)
  const freshReplies = useFreshReplies()
  const openPalette = useUI((s) => s.setPalette)
  const { installEvent, install } = usePWA()

  return (
    <nav className="rail flex flex-col px-3 pb-4 pt-5 max-[899px]:hidden" aria-label="Channels">
      <NavLink to="/t/for-you" aria-label="PaperWing home" className="mb-5 flex h-9 items-center px-2.5 max-[1279px]:justify-center max-[1279px]:px-0">
        <span className="rail-label">
          <Wordmark />
        </span>
        <span className="hidden max-[1279px]:inline">
          <Wordmark short />
        </span>
      </NavLink>

      <button
        onClick={() => openPalette(true)}
        className="mb-5 flex h-10 items-center gap-2.5 rounded-full bg-sunk px-3.5 text-left text-[0.875rem] text-ink-3 transition-colors hover:bg-active hover:text-ink-2 max-[1279px]:justify-center max-[1279px]:px-0"
        title="Find a topic or search (⌘K)"
      >
        <Search size={15} />
        <span className="rail-label flex-1">Find a topic</span>
        <kbd className="rail-label bg-ground">⌘K</kbd>
      </button>

      <RailLinks />

      <div className="mt-auto pt-6">
        {installEvent && (
          <button className="rail-link w-full" onClick={() => void install()} title="Install app">
            <span className="rail-glyph">
              <Download size={16} />
            </span>
            <span className="rail-label">Install app</span>
          </button>
        )}
        <RailLink to="/activity" icon={<Bell size={16} />}>
          <span className="flex w-full items-center justify-between">
            Activity
            {unread > 0 && <span className="num count-badge">{unread > 99 ? '99+' : unread}</span>}
          </span>
        </RailLink>
        {me && (
          <RailLink to={profilePath(me.handle)} icon={<Avatar avatar={me.avatar} handle={me.handle} size={16} />}>
            Your profile
          </RailLink>
        )}
        <RailLink to="/saved" icon={<Bookmark size={16} />}>
          <span className="flex w-full items-center justify-between">
            <span className="inline-flex items-center gap-2">Saved {freshReplies > 0 && <span className="dot" title={`${freshReplies} new replies in threads you watch`} />}</span>
            {savedCount > 0 && <span className="num text-ink-3">{savedCount}</span>}
          </span>
        </RailLink>
        <RailLink to="/settings" icon={<Settings size={16} />}>
          Settings
        </RailLink>
        <div className="mt-3 flex items-center justify-between gap-2 px-1 max-[1279px]:flex-col">
          <ThemeToggle />
          <span className="rail-label">
            <OfflineBadge />
          </span>
        </div>
      </div>
    </nav>
  )
}

/** Hides the mobile app bar while scrolling down and brings it back on any scroll up, like most reader apps. */
function useAutoHideBar(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    // Sticky rows below the bar need its live height, safe-area padding included.
    const ro = new ResizeObserver(() => root.style.setProperty('--appbar-h', `${el.offsetHeight}px`))
    ro.observe(el)
    let last = window.scrollY
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const y = window.scrollY
        if (Math.abs(y - last) < 6) return
        root.dataset.appbar = y > last && y > el.offsetHeight * 2 ? 'hidden' : 'shown'
        last = y
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
      delete root.dataset.appbar
    }
  }, [ref])
}

export function MobileBar() {
  const unread = useUnread()
  const ref = useRef<HTMLDivElement>(null)
  const setDrawer = useUI((s) => s.setDrawer)
  const me = useMe()
  useAutoHideBar(ref)
  return (
    <div ref={ref} className="mobile-bar flex items-center justify-between px-4 min-[900px]:hidden">
      <div className="flex items-center gap-1">
        {/* The mark already reads as a menu: four lines. On a phone it opens the drawer. */}
        <button className="-ml-2.5 grid size-11 place-items-center rounded-full active:bg-sunk" onClick={() => setDrawer(true)} aria-label="Menu" aria-haspopup="dialog">
          <Mark />
        </button>
        <NavLink to="/t/for-you" aria-label="PaperWing home">
          <span className="wordmark">PaperWing</span>
        </NavLink>
      </div>
      <div className="flex items-center gap-1">
        <OfflineBadge />
        {me && (
          <NavLink to={profilePath(me.handle)} className="icon-btn" aria-label="Your profile" title={`@${me.handle}`}>
            <Avatar avatar={me.avatar} handle={me.handle} size={24} />
          </NavLink>
        )}
        <NavLink to="/activity" className="icon-btn relative" aria-label={unread ? `Activity, ${unread} new` : 'Activity'}>
          <Bell size={18} />
          {unread > 0 && <span className="count-badge absolute -right-0.5 -top-0.5">{unread > 9 ? '9+' : unread}</span>}
        </NavLink>
        <NavLink to="/settings" className="icon-btn" aria-label="Settings">
          <Settings size={18} />
        </NavLink>
        <ThemeToggle />
      </div>
    </div>
  )
}

/** On phones, everything the sidebar holds, a tap on the mark away. */
export function Drawer() {
  const unread = useUnread()
  const open = useUI((s) => s.drawer)
  const setDrawer = useUI((s) => s.setDrawer)
  const close = useCallback(() => setDrawer(false), [setDrawer])
  const freshReplies = useFreshReplies()
  const openPalette = useUI((s) => s.setPalette)
  return (
    <Sheet open={open} onClose={close} side="left" label="Menu">
      <div className="mb-4 flex items-center justify-between pl-2.5">
        <Wordmark />
        <button className="icon-btn" onClick={close} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>
      <button
        onClick={() => {
          close()
          openPalette(true)
        }}
        className="mb-4 flex h-10 w-full items-center gap-2.5 rounded-full bg-sunk px-3.5 text-left text-[0.9375rem] text-ink-3"
      >
        <Search size={15} />
        Find a topic
      </button>
      <RailLinks drawer />
      <div className="mt-5 border-t border-line pt-3">
        <RailLink to="/activity" icon={<Bell size={16} />}>
          <span className="inline-flex items-center gap-2">Activity {unread > 0 && <span className="num count-badge">{unread > 99 ? '99+' : unread}</span>}</span>
        </RailLink>
        <RailLink to="/saved" icon={<Bookmark size={16} />}>
          <span className="inline-flex items-center gap-2">Saved {freshReplies > 0 && <span className="dot" />}</span>
        </RailLink>
        <RailLink to="/settings" icon={<Settings size={16} />}>
          Settings
        </RailLink>
      </div>
    </Sheet>
  )
}

export function BottomNav() {
  const freshReplies = useFreshReplies()
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '')
  return (
    <nav className="bottom-nav" aria-label="Primary">
      <NavLink to="/today" className={cls}>
        <CalendarDays size={20} />
        Today
      </NavLink>
      <NavLink to="/t/for-you" className={cls}>
        <Sparkles size={20} />
        For you
      </NavLink>
      <NavLink to="/explore" className={cls}>
        <Compass size={20} />
        Explore
      </NavLink>
      <NavLink to="/search" className={cls}>
        <Search size={20} />
        Search
      </NavLink>
      <NavLink to="/saved" className={cls}>
        <span className="relative">
          <Bookmark size={20} />
          {freshReplies > 0 && <span className="dot absolute -right-1 -top-0.5" aria-label="New replies" />}
        </span>
        Saved
      </NavLink>
    </nav>
  )
}

export function Toaster() {
  const toasts = useUI((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[70] flex w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 flex-col items-center gap-2 max-[899px]:bottom-24" aria-live="polite">
      {toasts.map((t) => (
        // One line reads as a pill; a longer message wraps into a card with the same corners,
        // its text left-aligned and its button kept to one side, never squeezed or wrapped.
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={`toast pointer-events-auto flex max-w-full items-center gap-3 rounded-[1.375rem] py-2.5 pl-5 pr-2.5 text-[0.875rem] font-semibold leading-snug shadow-[var(--float)] ${t.tone === 'error' ? 'bg-signal text-signal-ink' : 'bg-ink text-ground'}`}
          style={{ animation: 'rise 180ms var(--ease)' }}
          onClick={(e) => (e.target as Element).closest('button') || useUI.getState().dismiss(t.id)}
        >
          <span className="line-clamp-4 min-w-0 flex-1 text-pretty py-0.5 [overflow-wrap:anywhere]">{t.message}</span>
          {t.action ? (
            <button
              className="flex-none whitespace-nowrap rounded-full bg-ground/15 px-3 py-1.5"
              onClick={() => {
                t.action!.run()
                useUI.getState().dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          ) : (
            <span className="w-1.5 flex-none" />
          )}
        </div>
      ))}
    </div>
  )
}

const SHORTCUTS: [string, string][] = [
  ['⌘K /', 'Find a topic, source or search'],
  ['j k', 'Next or previous story; opens it when the reader is open'],
  ['enter', 'Open the story in the reader'],
  ['c a', 'Go to the discussion or the article'],
  ['o', 'Open the original link in a new tab'],
  ['s', 'Save to your queue (kept offline)'],
  ['e', 'Archive a saved story, or bring it back'],
  ['w', 'Watch a discussion for new replies'],
  ['x', 'Hide the story'],
  ['u / d', 'Vote up or down: more or less like this'],
  ['n p', 'Next or previous thread in the comments'],
  ['esc', 'Close the reader'],
  ['r', 'Refresh the feed'],
  ['t', 'Switch light and dark'],
  ['?', 'This list'],
]

export function Help() {
  const open = useUI((s) => s.help)
  const setHelp = useUI((s) => s.setHelp)
  if (!open) return null
  return (
    <>
      <div className="overlay" onClick={() => setHelp(false)} />
      <div className="palette p-7" role="dialog" aria-label="Keyboard shortcuts">
        <h2 className="text-[1.375rem] font-bold tracking-tight">Keyboard</h2>
        <dl className="mt-5 grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-3 text-[0.875rem]">
          {SHORTCUTS.map(([k, d]) => (
            <div key={k} className="contents">
              <dt className="flex gap-1">
                {k.split(' ').map((part) => (
                  <kbd key={part}>{part}</kbd>
                ))}
              </dt>
              <dd className="text-ink-2">{d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  )
}
