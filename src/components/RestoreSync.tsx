import { KeyRound, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { codeFromPasskey, useSyncReadiness } from '../lib/passkey'
import { joinSync } from '../lib/sync'

/**
 * On the welcome page: bring an existing PaperWing across instead of starting fresh, with your
 * sync passkey (kept with your passwords, so a new device usually has it already) or a sync code.
 * Calls `onRestored` once the first sync has landed.
 */
export function RestoreSync({ onRestored }: { onRestored: () => void }) {
  const { available, passkeys: support } = useSyncReadiness()
  const [busy, setBusy] = useState<'passkey' | 'code'>()
  const [code, setCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [error, setError] = useState<string>()

  if (available === false) return null

  const restore = async (how: 'passkey' | 'code') => {
    setBusy(how)
    setError(undefined)
    try {
      await joinSync(how === 'passkey' ? await codeFromPasskey() : code, { passkey: how === 'passkey' })
      onRestored()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work')
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <section className="mt-6 rounded-[18px] bg-panel p-5">
      <h2 className="text-[1.0625rem] font-bold">Already use PaperWing?</h2>
      <p className="mt-1 text-[0.875rem] text-ink-2">Bring your topics, saved stories, feeds and settings across instead of starting fresh. Everything’s encrypted on your devices.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {/* Secondary: most people here are new, and "Start fresh" is theirs. */}
        {support !== 'no' && (
          <button className="btn" disabled={!!busy} onClick={() => void restore('passkey')}>
            {busy === 'passkey' ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} />} Restore with my passkey
          </button>
        )}
        {!showCode && (
          <button className="btn" disabled={!!busy} onClick={() => setShowCode(true)}>
            Use a sync code
          </button>
        )}
      </div>
      {showCode && (
        <form
          className="mt-3 flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void restore('code')
          }}
        >
          <input
            className="input"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="abcde-fghij-…"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="Sync code"
          />
          <button className="btn h-10 flex-none" disabled={!!busy || !code.trim()}>
            {busy === 'code' && <Loader2 size={15} className="spin" />} Restore
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-[0.8125rem] text-signal">{error}</p>}
      <p className="mt-3 text-[0.8125rem] text-ink-3">The code is under Settings, Saved and sync on your other device. You can also scan its pairing QR code with this phone’s camera.</p>
    </section>
  )
}
