import { parseStoryKey } from './storyKey'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getJson } from './sources/http'

// Your Mastodon account, for the home timeline, notifications and posting a story. Public
// timelines, trends and threads need no account. The token stays in this browser: it is never
// synced, and is sent only to your server.

export const DEFAULT_INSTANCE = 'hachyderm.io'
/** Mastodon shows the code to paste instead of redirecting back. */
const OOB = 'urn:ietf:wg:oauth:2.0:oob'
// Only what's used: posts, notifications and who you are to read; posting and favouriting to write.
const SCOPES = 'read:statuses read:notifications read:accounts write:statuses write:favourites'

interface App {
  instance: string
  clientId: string
  clientSecret: string
  /** What it was registered for, and from where: either changing means registering again. */
  scopes?: string
  origin?: string
}
interface Pending {
  instance: string
  verifier: string
  state: string
  redirect: string
  /** The server's approval page for this attempt. */
  url: string
}
interface MastodonState {
  instance: string
  token?: string
  acct?: string
  /** What the sign-in was granted; older sign-ins only read. */
  scope?: string
  /** Statuses you've favourited from here, by story key. */
  favourites?: Record<string, true>
  app?: App
  pending?: Pending
  setInstance: (instance: string) => void
  cancelSignIn: () => void
  signOut: () => void
}

export const useMastodon = create<MastodonState>()(
  persist(
    (set) => ({
      instance: DEFAULT_INSTANCE,
      setInstance: (instance) => set({ instance: normalizeInstance(instance) || DEFAULT_INSTANCE }),
      cancelSignIn: () => set({ pending: undefined }),
      signOut: () => {
        const { token, app } = useMastodon.getState()
        // Best effort: the token is forgotten here either way.
        if (token && app)
          void fetch(`https://${app.instance}/oauth/revoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, token }),
          }).catch(() => {})
        set({ token: undefined, acct: undefined, scope: undefined, pending: undefined })
      },
    }),
    { name: 'readout:mastodon', version: 1 },
  ),
)

export function normalizeInstance(input: string): string {
  const s = input.trim().replace(/^@?[^@\s]+@(?=[^@\s]+\.[^@\s]+$)/, '')
  try {
    return new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname.toLowerCase()
  } catch {
    return ''
  }
}

const callbackUrl = () => `${location.origin}/mastodon/callback`

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
const random = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)))
const challenge = async (verifier: string) => b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))

async function registerApp(instance: string): Promise<App> {
  const existing = useMastodon.getState().app
  if (existing?.instance === instance && existing.scopes === SCOPES && existing.origin === location.origin) return existing
  const res = await getJson<{ client_id: string; client_secret: string }>(`https://${instance}/api/v1/apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'PaperWing', redirect_uris: [callbackUrl(), OOB], scopes: SCOPES, website: location.origin }),
  })
  const app = { instance, clientId: res.client_id, clientSecret: res.client_secret, scopes: SCOPES, origin: location.origin }
  useMastodon.setState({ app })
  return app
}

/**
 * Prepares sign-in and returns the server's approval page. With `paste`, the server shows a code
 * to bring back (an installed iOS app can't be redirected back into); otherwise it redirects to
 * /mastodon/callback.
 */
export async function beginSignIn(input: string, paste: boolean): Promise<string> {
  const instance = normalizeInstance(input)
  if (!instance) throw new Error('That doesn’t look like a server name')
  const app = await registerApp(instance)
  const verifier = random(48)
  const state = random(16)
  const redirect = paste ? OOB : callbackUrl()
  const qs = new URLSearchParams({
    response_type: 'code',
    client_id: app.clientId,
    redirect_uri: redirect,
    scope: SCOPES,
    state,
    code_challenge: await challenge(verifier),
    code_challenge_method: 'S256',
  })
  const url = `https://${instance}/oauth/authorize?${qs}`
  useMastodon.setState({ instance, pending: { instance, verifier, state, redirect, url } })
  return url
}

/** Trades the code for a token. `state` is checked when the code came back by redirect. */
export async function completeSignIn(code: string, state?: string): Promise<string> {
  const { pending, app } = useMastodon.getState()
  if (!pending || !app || app.instance !== pending.instance) throw new Error('Start signing in again from Settings')
  if (state !== undefined && state !== pending.state) throw new Error('That sign-in link has expired. Start again from Settings')
  const { access_token, scope } = await getJson<{ access_token: string; scope?: string }>(`https://${pending.instance}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: code.trim(),
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: pending.redirect,
      code_verifier: pending.verifier,
      scope: SCOPES,
    }),
  })
  const me = await getJson<{ acct: string }>(`https://${pending.instance}/api/v1/accounts/verify_credentials`, { headers: { Authorization: `Bearer ${access_token}` } })
  useMastodon.setState({ token: access_token, acct: `${me.acct}@${pending.instance}`, instance: pending.instance, scope: scope ?? SCOPES, pending: undefined })
  return me.acct
}

/** Whether the sign-in can post (older ones could only read). */
export const canPostToMastodon = (s: Pick<MastodonState, 'token' | 'scope'>) => !!s.token && /\bwrite(:statuses)?\b/.test(s.scope ?? '')

/** Posts a status as you. Returns where it can be seen. */
export async function postToMastodon(text: string): Promise<string> {
  const { token, instance } = useMastodon.getState()
  if (!token) throw new Error('Sign in to Mastodon first (Settings, Sources)')
  const res = await fetch(`https://${instance}/api/v1/statuses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ status: text, visibility: 'public' }),
  })
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
  if (res.status === 403 || res.status === 401) throw new Error('Your Mastodon sign-in can only read: sign in again under Settings, Sources to allow posting.')
  if (!res.ok) throw new Error(data.error ?? `Mastodon didn’t post that (${res.status})`)
  return data.url ?? `https://${instance}`
}

/** Whether the sign-in can favourite (an upvote, from the story's arrows). */
export const canFavourite = (s: Pick<MastodonState, 'token' | 'scope'>) => !!s.token && /\bwrite(:favourites)?\b/.test(s.scope ?? '')

/** Favourites a status on your own server (or takes it back). Only statuses read through your server have its ids. */
export async function favourite(key: string, on: boolean) {
  const { token, instance, favourites = {} } = useMastodon.getState()
  // Undoes this post's mark only: others may have been favourited while this one was on its way.
  const undo = () =>
    useMastodon.setState((s) => {
      const f = { ...(s.favourites ?? {}) }
      if (favourites[key]) f[key] = true
      else delete f[key]
      return { favourites: f }
    })
  const p = parseStoryKey(key)
  const host = p?.kind === 'md' ? p.instance : undefined
  const id = p?.kind === 'md' ? p.id : ''
  if (!token || host !== instance) throw new Error('Only posts read through your own Mastodon server can be favourited')
  const next = { ...favourites }
  if (on) next[key] = true
  else delete next[key]
  useMastodon.setState({ favourites: next })
  const res = await fetch(`https://${instance}/api/v1/statuses/${encodeURIComponent(id)}/${on ? 'favourite' : 'unfavourite'}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(
    () => {
      undo()
      throw new Error(`Couldn’t reach ${instance}. Check your connection and try again.`)
    },
  )
  if (!res.ok) {
    undo()
    throw new Error(res.status === 403 ? 'Your Mastodon sign-in can’t favourite: sign in again under Settings, Sources.' : `Mastodon didn’t take that (${res.status})`)
  }
}
