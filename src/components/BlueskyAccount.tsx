import { Link } from 'react-router'
import { profilePath } from '../lib/people'
import { useState } from 'react'
import { canReadNotifications, canReadTimeline, canWrite, finishWithCode, signIn, signOut, useAtproto } from '../lib/atproto'
import { MIX_NSID } from '../lib/mixSources'
import { SUBMISSION_NSID } from '../lib/paperwing'
import { SHARE_NSID } from '../lib/social'
import { listOf } from '../lib/channels'
import { toast } from '../lib/ui'

const input = 'h-10 min-w-0 flex-1 rounded-full bg-sunk px-4 text-[0.9375rem] placeholder:text-ink-3 focus:outline-none'

/** Settings: sign in with a Bluesky (atproto) account, for replying and liking, and Frontpage. */
export function BlueskyAccount() {
  const { handle, pending, scope } = useAtproto()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const start = (who: string) => {
    setBusy(true)
    signIn(who).catch((err: Error) => {
      setBusy(false)
      toast(`Couldn’t start signing in: ${err.message}`, { tone: 'error' })
    })
  }

  if (handle) {
    return (
      <div className="max-w-lg space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-[0.9375rem]">
            Signed in as <span className="font-semibold">@{handle}</span>. You can reply and like on Bluesky threads, and vote and comment on Frontpage.{' '}
            <Link to={profilePath(handle)} className="font-semibold underline underline-offset-2">
              Your PaperWing profile
            </Link>
          </p>
          <button className="btn" onClick={() => void signOut().then(() => toast('Signed out of Bluesky'))}>
            Sign out
          </button>
        </div>
        {(canReadTimeline(scope) === false ||
          canReadNotifications(scope) === false ||
          canWrite(scope, MIX_NSID) === false ||
          canWrite(scope, SUBMISSION_NSID) === false ||
          canWrite(scope, SHARE_NSID) === false) && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-sunk px-4 py-3">
            <p className="flex-1 text-[0.875rem] text-ink-2">
              This sign-in is from before{' '}
              {listOf(
                [
                  canReadTimeline(scope) === false && 'Following (reading your timeline)',
                  canReadNotifications(scope) === false && 'Activity (your notifications)',
                  canWrite(scope, MIX_NSID) === false && 'publishing mixes',
                  canWrite(scope, SHARE_NSID) === false && 'sharing, notes, blogrolls and boards',
                ].filter((x): x is string => !!x),
              )}
              . Bluesky shows what’s asked before you approve.
            </p>
            <button className="btn btn-primary flex-none" disabled={busy} onClick={() => start(handle)}>
              Allow
            </button>
          </div>
        )}
        {pending && <PasteCode />}
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) start(draft)
        }}
      >
        <input
          className={input}
          autoCapitalize="off"
          autoCorrect="off"
          inputMode="email"
          placeholder="you.bsky.social"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Your Bluesky handle"
        />
        <button className="btn btn-primary flex-none" disabled={busy}>
          Sign in
        </button>
      </form>
      {pending && <PasteCode />}
      <p className="text-[0.8125rem] text-ink-3">
        Any atproto account works, Bluesky or your own server. PaperWing asks only to create posts, likes and their pictures, PaperWing submissions, Frontpage comments and votes, and your mixes and
        their feeds, and to read your timeline for Following. Your sign-in stays in this browser.
      </p>
    </div>
  )
}

/** The code Safari shows after signing in from the installed iPhone app, pasted back here. */
function PasteCode() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        finishWithCode(code)
          .then(() => toast(`Signed in as @${useAtproto.getState().handle}`))
          .catch((err: Error) => toast(`That code didn’t work: ${err.message}`, { tone: 'error' }))
          .finally(() => setBusy(false))
      }}
    >
      <input className={input} autoCapitalize="off" autoCorrect="off" placeholder="Paste the code from Safari" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Sign-in code" />
      <button className="btn flex-none" disabled={busy || !code.trim()}>
        Finish
      </button>
    </form>
  )
}
