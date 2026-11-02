import { useState } from 'react'
import { beginSignIn, canPostToMastodon, completeSignIn, DEFAULT_INSTANCE, normalizeInstance, useMastodon } from '../lib/mastodon'
import { isIOS, usePWA } from '../lib/pwa'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { keys } from '../lib/query'
import { toast } from '../lib/ui'

/** Drops cached Mastodon feeds, so the next view reads from the right server with the right account. */
export const refreshMastodon = (qc: QueryClient) => qc.removeQueries({ queryKey: keys.feeds, predicate: (q) => String(q.queryKey[1]).startsWith('md:') })

const input = 'h-10 min-w-0 flex-1 rounded-full bg-sunk px-4 text-[0.9375rem] placeholder:text-ink-3 focus:outline-none'

export function MastodonSettings() {
  const { instance, acct, pending, signOut, setInstance, cancelSignIn } = useMastodon()
  const qc = useQueryClient()
  const canPost = useMastodon(canPostToMastodon)
  const standalone = usePWA((s) => s.standalone)
  const [server, setServer] = useState(instance)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  // An installed iOS app can't be redirected back into, so there the server shows a code to paste.
  // Anywhere else it's the fallback if the redirect doesn't come back.
  const [useCode, setUseCode] = useState(() => standalone && isIOS())
  const waiting = pending?.url && pending.redirect.startsWith('urn:') ? pending : undefined

  if (acct) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-[0.9375rem]">
            Signed in as <span className="font-semibold">@{acct}</span>. Following shows your home timeline, and Share can post there.
          </p>
          <button
            className="btn"
            onClick={() => {
              signOut()
              refreshMastodon(qc)
              toast('Signed out of Mastodon')
            }}
          >
            Sign out
          </button>
        </div>
        {!canPost && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-sunk px-4 py-3">
            <p className="flex-1 text-[0.875rem] text-ink-2">This sign-in can only read. To share stories to Mastodon, sign in again: your server shows what’s asked.</p>
            <button
              className="btn btn-primary flex-none"
              onClick={() => {
                signOut()
                refreshMastodon(qc)
                setServer(instance)
              }}
            >
              Sign in again
            </button>
          </div>
        )}
      </div>
    )
  }

  const start = async (e: React.FormEvent) => {
    e.preventDefault()
    const host = normalizeInstance(server)
    if (!host) return toast('Enter your server, like hachyderm.io', { tone: 'error' })
    setBusy(true)
    try {
      if (host !== instance) {
        setInstance(host)
        refreshMastodon(qc)
      }
      const url = await beginSignIn(host, useCode)
      // A redirect can leave from here. A new window can't: browsers only open one straight from
      // a tap, and this is after a network round trip. So the code flow shows a link to tap instead.
      if (!useCode) location.assign(url)
    } catch (err) {
      toast(`Couldn’t reach ${host}: ${(err as Error).message}`, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const finish = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const who = await completeSignIn(code)
      setCode('')
      refreshMastodon(qc)
      toast(`Signed in as @${who}`)
    } catch (err) {
      toast(`That code didn’t work: ${(err as Error).message}. Codes last a few minutes and work once, so try the steps again.`, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  if (waiting) {
    return (
      <>
        <ol className="list-decimal space-y-3 pl-5 text-[0.9375rem] leading-relaxed text-ink-2 marker:font-bold marker:text-ink">
          <li>
            <a className="font-semibold text-ink underline decoration-signal decoration-2 underline-offset-4" href={waiting.url} target="_blank" rel="noopener noreferrer">
              Open {waiting.instance}
            </a>{' '}
            and approve PaperWing. Sign in there first if it asks.
          </li>
          <li>{waiting.instance} then shows an authorization code. Copy it.</li>
          <li>Come back here and paste it:</li>
        </ol>
        <form className="flex flex-wrap items-center gap-2" onSubmit={finish}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Authorization code"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className={`${input} font-mono`}
            aria-label="Authorization code"
          />
          <button className="btn" type="submit" disabled={busy || !code.trim()}>
            Finish
          </button>
        </form>
        <button className="text-[0.8125rem] text-ink-3 underline underline-offset-4 hover:text-ink" onClick={cancelSignIn}>
          Start over
        </button>
      </>
    )
  }

  return (
    <>
      <p className="text-[0.9375rem] leading-relaxed text-ink-2">
        Trending posts, hashtags and threads come from <span className="font-semibold">{instance}</span> without an account. Sign in to add the people you follow.
      </p>
      <form className="flex flex-wrap items-center gap-2" onSubmit={start}>
        <input
          value={server}
          onChange={(e) => setServer(e.target.value)}
          placeholder={DEFAULT_INSTANCE}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className={input}
          aria-label="Your Mastodon server"
        />
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Preparing…' : 'Sign in'}
        </button>
      </form>
      <p className="text-[0.8125rem] leading-relaxed text-ink-3">
        PaperWing asks to read your timeline, notifications and profile, and to post and favourite only when you share or like something. The sign-in stays in this browser: it isn't synced, and it's
        only sent to {instance}.{' '}
        {useCode ? (
          'Your server will show a code to paste back here.'
        ) : (
          <button className="underline underline-offset-4 hover:text-ink" onClick={() => setUseCode(true)}>
            Sign in with a code instead
          </button>
        )}
      </p>
    </>
  )
}
