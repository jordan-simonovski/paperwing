import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { lemmySignIn, lemmySignOut, lemmySubscriptions, TotpRequired, useLemmyAccount } from '../lib/lemmyAccount'
import { usePrefs } from '../lib/store'
import { toast } from '../lib/ui'

const input = 'h-10 min-w-0 flex-1 rounded-full bg-sunk px-4 text-[0.9375rem] placeholder:text-ink-3'

/** Brings your Lemmy subscriptions into PaperWing's joined communities. */
async function importSubscriptions() {
  const theirs = await lemmySubscriptions()
  const { communities, set } = usePrefs.getState()
  const added = theirs.filter((c) => !communities.some((x) => x.name === c.name))
  if (added.length) set({ communities: [...communities, ...added] })
  return added.length
}

/** Settings: sign in to your Lemmy account, for voting, commenting, posting and your subscriptions. */
export function LemmyAccount() {
  const { user, instance } = useLemmyAccount()
  const [server, setServer] = useState(instance ?? 'lemmy.world')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState<string>()
  const [busy, setBusy] = useState(false)

  if (user)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-[0.9375rem]">
          Signed in as{' '}
          <span className="font-semibold">
            {user}@{instance}
          </span>
          . You can vote, comment, share to communities, and joining a community joins it on your account.
        </p>
        <button
          className="btn"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            importSubscriptions()
              .then((n) => toast(n ? `Added ${n} ${n === 1 ? 'community' : 'communities'} you follow` : 'You already have all your communities here'))
              .catch((err: Error) => toast(err.message, { tone: 'error' }))
              .finally(() => setBusy(false))
          }}
        >
          Import my communities
        </button>
        <button className="btn" onClick={() => (lemmySignOut(), toast('Signed out of Lemmy'))}>
          Sign out
        </button>
      </div>
    )

  return (
    <form
      className="max-w-lg space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!server.trim() || !name.trim() || !password) return
        setBusy(true)
        lemmySignIn(server, name, password, totp)
          .then(async (u) => {
            setPassword('')
            setTotp(undefined)
            const n = await importSubscriptions().catch(() => 0)
            toast(`Signed in to Lemmy as ${u}${n ? `, and added ${n} ${n === 1 ? 'community' : 'communities'} you follow` : ''}`)
          })
          .catch((err: Error) => {
            if (err instanceof TotpRequired) setTotp('')
            toast(err.message, { tone: err instanceof TotpRequired ? undefined : 'error' })
          })
          .finally(() => setBusy(false))
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input
          className={input}
          autoCapitalize="off"
          autoCorrect="off"
          inputMode="url"
          placeholder="Your server, e.g. lemmy.world"
          value={server}
          onChange={(e) => setServer(e.target.value)}
          aria-label="Lemmy server"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          className={input}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="username"
          placeholder="Username or email"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Lemmy username"
        />
        <input className={input} type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Lemmy password" />
      </div>
      {totp !== undefined && (
        <div className="flex gap-2">
          <input
            className={input}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Code from your authenticator app"
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
            aria-label="Two-factor code"
          />
        </div>
      )}
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy || !server.trim() || !name.trim() || !password}>
          {busy && <Loader2 size={14} className="spin" />} Sign in
        </button>
      </div>
      <p className="text-[0.8125rem] leading-snug text-ink-3">
        Your password goes straight from this browser to your Lemmy server, not through PaperWing. The sign-in it gives back stays on this device, never synced. Communities you follow come along.
      </p>
    </form>
  )
}
