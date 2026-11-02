import { ArrowRight, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { HOME } from '../lib/oauthClient'
import { newSyncCode, syncAvailable, syncNow, useSync } from '../lib/sync'
import { toast } from '../lib/ui'

// PaperWing moved from its vercel.app address to paperwing.io. Everything kept in this browser
// (saved stories, topics, feeds, settings) belongs to the old address, so on the old address this
// offers the move: sync carries it all across, then the new address pairs with the same code.

const OLD = location.hostname === 'tech-reader-nine.vercel.app'

/** Whether paperwing.io answers yet: an opaque response is enough to know its DNS is live. */
const homeLive = () =>
  fetch(`https://${HOME}/icon-192.png`, { mode: 'no-cors', cache: 'no-store' }).then(
    () => true,
    () => false,
  )

export async function moveHome() {
  if (!(await syncAvailable())) throw new Error('Sync isn’t available right now, so nothing could be carried across. Try again shortly.')
  let code = useSync.getState().code
  if (!code) {
    code = newSyncCode()
    useSync.getState().setCode(code)
  }
  await syncNow()
  const error = useSync.getState().error
  if (error) throw new Error(`Couldn’t sync before moving: ${error}`)
  // The code rides in the #fragment, which never reaches a server.
  location.href = `https://${HOME}/pair#${code}`
}

export function MoveHome() {
  const [live, setLive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('readout:move-later') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    if (OLD && !dismissed) void homeLive().then(setLive)
  }, [dismissed])
  if (!OLD || !live || dismissed) return null
  return (
    <div className="move-home" role="status">
      <div className="min-w-0 flex-1">
        <p className="text-[0.9375rem] font-bold">PaperWing has moved to {HOME}</p>
        <p className="mt-0.5 text-[0.8125rem] text-ink-2">
          Bring your saved stories, topics, feeds and settings with you: it takes a moment, through sync. Sign in to Bluesky, Hacker News and Mastodon again there.
        </p>
      </div>
      <button
        className="btn btn-primary flex-none"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          moveHome().catch((err: Error) => {
            setBusy(false)
            toast(err.message, { tone: 'error' })
          })
        }}
      >
        {busy ? <Loader2 size={15} className="spin" /> : <ArrowRight size={15} />} Move
      </button>
      <button
        className="icon-btn flex-none"
        aria-label="Later"
        onClick={() => {
          try {
            sessionStorage.setItem('readout:move-later', '1')
          } catch {
            /* fine */
          }
          setDismissed(true)
        }}
      >
        <X size={15} />
      </button>
    </div>
  )
}
