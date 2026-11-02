import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { finishSignIn, useAtproto } from '../lib/atproto'
import { afterSignIn } from '../lib/onboarding'
import { isIOS } from '../lib/pwa'
import { toast } from '../lib/ui'

// A code can be traded only once; development mode runs effects twice.
let handled = false

/**
 * Where a Bluesky (atproto) sign-in comes back to. In the browser that started it, it finishes here.
 * An installed iPhone app finishes its sign-in in Safari instead, which doesn't hold the app's keys:
 * then this page shows the code to paste back into the app.
 */
export function AtprotoCallback() {
  const navigate = useNavigate()
  const [code, setCode] = useState<string>()
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  useEffect(() => {
    if (handled) return
    handled = true
    const raw = location.hash.slice(1) || location.search.slice(1)
    const params = new URLSearchParams(raw)
    if (params.get('error')) {
      toast(params.get('error') === 'access_denied' ? 'Bluesky sign-in cancelled' : `Bluesky sign-in failed: ${params.get('error_description') ?? params.get('error')}`, { tone: 'error' })
      navigate(afterSignIn(), { replace: true })
      return
    }
    void finishSignIn().then((done) => {
      if (done) {
        toast(`Signed in as @${useAtproto.getState().handle}`)
        navigate(afterSignIn(), { replace: true })
      } else if (params.get('code')) setCode(raw)
      else navigate(afterSignIn(), { replace: true })
    })
  }, [navigate])

  if (!code) return <p className="py-24 text-center text-ink-3">Signing in with Bluesky…</p>
  // A sign-in that this browser didn't start. The only honest case is PaperWing's own iPhone app,
  // which can't be redirected back into: it finishes in Safari and the code is pasted into the app.
  // Anywhere else, or before you confirm, the code stays hidden: someone could have started this
  // sign-in themselves and be waiting for you to hand it over.
  if (!isIOS() || window.matchMedia('(display-mode: standalone)').matches)
    return (
      <div className="mx-auto max-w-md space-y-4 px-6 py-16">
        <h1 className="text-[1.375rem] font-bold">This sign-in didn’t start here</h1>
        <p className="text-ink-2">If you just tried to sign in to PaperWing with Bluesky, start again from Settings, Sources in this browser. If you didn’t, ignore this: nothing was signed in.</p>
      </div>
    )
  if (!confirmed)
    return (
      <div className="mx-auto max-w-md space-y-4 px-6 py-16">
        <h1 className="text-[1.375rem] font-bold">Did you start this in the PaperWing app?</h1>
        <p className="text-ink-2">
          Signing in from PaperWing on your home screen finishes here in Safari, with a code to take back to the app. Only continue if you started signing in from that app, on this iPhone, just now.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => setConfirmed(true)}>
            Yes, I did
          </button>
          <button className="btn" onClick={() => navigate('/t/for-you', { replace: true })}>
            No
          </button>
        </div>
      </div>
    )
  return (
    <div className="mx-auto max-w-md space-y-4 px-6 py-16">
      <h1 className="text-[1.375rem] font-bold">Almost there</h1>
      <p className="text-ink-2">Copy this code, go back to the PaperWing app, and paste it under Settings, Sources, Bluesky.</p>
      <p className="rounded-xl bg-signal-soft p-3 text-[0.875rem] font-semibold text-ink">
        Paste it only into the PaperWing app. Never into a website, a form or a message: whoever has this code can sign in as you.
      </p>
      <p className="break-all rounded-xl bg-sunk p-3 font-mono text-[0.75rem] text-ink-2">{code}</p>
      <button
        className="btn btn-primary"
        onClick={() =>
          void navigator.clipboard.writeText(code).then(
            () => setCopied(true),
            () => toast('Couldn’t copy: select the code and copy it', { tone: 'error' }),
          )
        }
      >
        {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy code'}
      </button>
    </div>
  )
}
