import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { usePrefs } from '../lib/store'
import { formatCode, isCode, normalizeCode, syncNow, useSync } from '../lib/sync'
import { toast } from '../lib/ui'

/**
 * Opened from another device's pairing link or QR code. The code rides in the #fragment, which
 * never reaches a server. Pairing asks first: a link like this can sit in any comment, and joining
 * someone else's space would upload this device's whole library to them.
 */
export function PairPage() {
  const navigate = useNavigate()
  const [code] = useState(() => normalizeCode(location.hash.slice(1)))
  const current = useSync((s) => s.code)
  const valid = isCode(code)

  useEffect(() => {
    // Drop the code from the address bar and history either way.
    history.replaceState(history.state, '', '/pair')
    if (!valid) {
      toast("That pairing link isn't complete", { tone: 'error' })
      navigate('/saved', { replace: true })
    } else if (current === code) navigate('/saved', { replace: true })
    // Only on arrival: pairing changes `current` and navigates itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!valid || current === code) return null
  const pair = () => {
    useSync.getState().setCode(code)
    // Topics come over with the rest: no need to pick them again here.
    usePrefs.getState().set({ welcomed: true })
    void syncNow().then(() => toast(useSync.getState().error ? `Paired, but the first sync failed: ${useSync.getState().error}` : 'This device is now in sync'))
    navigate('/saved', { replace: true })
  }
  return (
    <div className="wide-col grid place-items-center px-4 py-16">
      <div className="w-full max-w-[28rem] space-y-4 rounded-[18px] bg-panel p-6">
        <h1 className="text-[1.375rem] font-bold leading-tight">Pair this device?</h1>
        <p className="text-[0.9375rem] leading-relaxed text-ink-2">
          This device will join the sync group <span className="whitespace-nowrap font-mono text-[0.875rem]">{formatCode(code).slice(0, 11)}…</span> and upload its saved stories, watched threads,
          topics, feeds and mutes there.
        </p>
        <p className="text-[0.875rem] leading-relaxed text-ink-3">
          {current ? 'It replaces the sync this device uses now. ' : ''}Only continue if you opened this link from one of your own devices. Anyone who sent you a link like this could read everything
          you sync.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button className="btn btn-primary" onClick={pair}>
            Pair this device
          </button>
          <button className="btn" onClick={() => navigate('/saved', { replace: true })}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
