import { useEffect } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { BottomNav, Drawer, Help, MobileBar, Rail, Toaster } from '../components/Chrome'
import { Palette } from '../components/Palette'
import { useLibrary } from '../lib/library'
import { useWatch } from '../lib/watch'
import { usePrefs } from '../lib/store'
import { isTyping, useUI } from '../lib/ui'
import { Composer } from '../components/Composer'
import { MoveHome } from '../components/MoveHome'
import { useMediaQuery } from '../lib/hooks'
import { useBlogrollPublisher } from '../lib/blogroll'

export function Root() {
  const { theme, textSize, density, set, welcomed } = usePrefs()
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const { pathname } = useLocation()
  useBlogrollPublisher()

  useEffect(() => {
    const el = document.documentElement
    el.dataset.theme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
    el.dataset.text = textSize
    el.dataset.density = density
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', el.dataset.theme === 'dark' ? '#100f0e' : '#f4f4f1')
  }, [theme, textSize, density, systemDark])

  useEffect(() => {
    void useLibrary.getState().load()
    // Mixes you follow pick up their authors' edits.
    void import('../lib/mixes').then((m) => m.refreshFollowedMixes())
    // Watched threads are checked while the app is open; the Saved dot shows what's new.
    const check = () => document.visibilityState === 'visible' && void useWatch.getState().check()
    check()
    const timer = window.setInterval(check, 10 * 60_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  // Phones: while the keyboard is up, a fixed bottom bar rides above it, and once it closes iOS can
  // leave the page scrolled past its end, holding the bar up off the bottom. So the bottom nav
  // steps aside while the keyboard is showing, and the page settles back when it goes.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const field = () => {
      const el = document.activeElement
      return el instanceof HTMLElement && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]), textarea, [contenteditable="true"]')
    }
    // The tallest the screen has been: the keyboard is whatever takes a big bite out of it.
    let full = Math.max(window.innerHeight, vv.height)
    const settle = () => {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      if (window.scrollY > max) window.scrollTo(window.scrollX, max)
    }
    const update = () => {
      full = Math.max(full, window.innerHeight, vv.height)
      const keyboard = field() && vv.height < full - 150
      const el = document.documentElement
      if (keyboard) el.dataset.keyboard = ''
      else if ('keyboard' in el.dataset) {
        delete el.dataset.keyboard
        window.setTimeout(settle, 300)
      }
    }
    const onOut = () => window.setTimeout(update, 50)
    vv.addEventListener('resize', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', onOut)
    return () => {
      vv.removeEventListener('resize', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', onOut)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ui.setPalette(!ui.palette)
        return
      }
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') {
        ui.setPalette(false)
        ui.setHelp(false)
      } else if (e.key === '/') {
        e.preventDefault()
        ui.setPalette(true)
      } else if (e.key === '?') ui.setHelp(!ui.help)
      else if (e.key === 't') set({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [set])

  // A new install starts by picking what to read. Pages that finish something started elsewhere
  // (a sign-in, pairing, a share) are left alone.
  if (pathname === '/brand') return <Outlet />
  // A story someone shared (/t/<channel>/<story>) opens straight away, with a note to set up after.
  const sharedStory = /^\/(t\/[^/]+\/[^/]+|u\/[^/]+)/.test(pathname)
  if (!welcomed && !sharedStory && !/^\/(welcome|privacy|terms|principles|pair|share|settings|mix\/|atproto-callback|mastodon\/callback)/.test(pathname)) return <Navigate to="/welcome" replace />

  return (
    <>
      <div className="status-shim" aria-hidden />
      <MobileBar />
      {!welcomed && sharedStory && (
        <Link to="/welcome" className="newcomer-bar">
          <span className="min-w-0 flex-1">
            <strong>New to PaperWing?</strong> One reader for Hacker News, Lemmy, Bluesky, Mastodon and RSS.
          </span>
          <span className="flex-none font-semibold underline underline-offset-2">Set it up</span>
        </Link>
      )}
      <div className="shell">
        <Rail />
        <Outlet />
      </div>
      <BottomNav />
      <Drawer />
      <Palette />
      <Help />
      <Composer />
      <MoveHome />
      <Toaster />
    </>
  )
}
