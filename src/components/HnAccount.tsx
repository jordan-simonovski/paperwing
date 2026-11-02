import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { hnSignIn, hnSignOut, useHn } from '../lib/hnAccount'
import { toast } from '../lib/ui'

const input = 'h-10 min-w-0 flex-1 rounded-full bg-sunk px-4 text-[0.9375rem] placeholder:text-ink-3 focus:outline-none'

/** Settings: sign in to Hacker News, for upvoting and commenting from PaperWing. */
export function HnAccount() {
  const user = useHn((h) => h.user)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  if (user)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-[0.9375rem]">
          Signed in as <span className="font-semibold">{user}</span>. You can upvote and comment on Hacker News threads.
        </p>
        <button className="btn" onClick={() => (hnSignOut(), toast('Signed out of Hacker News'))}>
          Sign out
        </button>
      </div>
    )

  return (
    <form
      className="max-w-lg space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim() || !password) return
        setBusy(true)
        hnSignIn(name.trim(), password)
          .then((u) => {
            setPassword('')
            toast(`Signed in to Hacker News as ${u}`)
          })
          .catch((err: Error) => toast(err.message, { tone: 'error' }))
          .finally(() => setBusy(false))
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input
          className={input}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="username"
          placeholder="Username"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Hacker News username"
        />
        <input
          className={input}
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="Hacker News password"
        />
        <button className="btn btn-primary flex-none" disabled={busy || !name.trim() || !password}>
          {busy && <Loader2 size={14} className="spin" />} Sign in
        </button>
      </div>
      <p className="text-[0.8125rem] leading-snug text-ink-3">
        Hacker News has no way for apps to sign in except your password, so this works like every HN app: it goes to Hacker News once, through PaperWing’s server, and isn’t kept anywhere. HN’s sign-in
        is then stored on this device only, never synced.
      </p>
    </form>
  )
}
