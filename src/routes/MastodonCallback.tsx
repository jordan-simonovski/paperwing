import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { refreshMastodon } from '../components/MastodonSettings'
import { completeSignIn } from '../lib/mastodon'
import { afterSignIn } from '../lib/onboarding'
import { usePrefs } from '../lib/store'
import { toast } from '../lib/ui'

// A code can be traded only once; development mode runs effects twice.
let handled = false

/** Where Mastodon sends you back after you approve PaperWing. */
export function MastodonCallback() {
  const navigate = useNavigate()
  useEffect(() => {
    if (handled) return
    handled = true
    const p = new URLSearchParams(location.search)
    const code = p.get('code')
    if (!code) {
      toast(p.get('error') === 'access_denied' ? 'Mastodon sign-in cancelled' : 'Mastodon didn’t send a sign-in code', { tone: 'error' })
      navigate(afterSignIn(), { replace: true })
      return
    }
    completeSignIn(code, p.get('state') ?? '')
      .then((who) => {
        refreshMastodon()
        toast(`Signed in as @${who}`)
        navigate(usePrefs.getState().welcomed ? '/t/mastodon?v=following' : '/welcome', { replace: true })
      })
      .catch((err: Error) => {
        toast(err.message, { tone: 'error' })
        navigate(afterSignIn(), { replace: true })
      })
  }, [navigate])
  return <p className="py-24 text-center text-ink-3">Signing in to Mastodon…</p>
}
