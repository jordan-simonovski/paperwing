import type { BrowserOAuthClient, OAuthClientMetadataInput, OAuthSession } from '@atproto/oauth-client-browser'
import { create } from 'zustand'
import { clientMetadata, HOME, HOSTS, SCOPE } from './oauthClient'
import { persist } from 'zustand/middleware'

// Signing in with a Bluesky (atproto) account, entirely in the browser: the OAuth client keeps its
// keys and tokens in this browser's IndexedDB, and PaperWing's server never sees them. It's how
// PaperWing replies and likes on Bluesky, and votes and comments on Frontpage, writing records to
// the reader's own repo. Only the permissions those need are asked for.
//
// Handles are resolved by our own server (/xrpc/com.atproto.identity.resolveHandle), not
// Bluesky's, so signing in doesn't tell a third party who's asking.
//
// An installed iPhone app can't be redirected back into: the sign-in finishes in Safari, which
// shows a code to paste back here (the app holds the keys that make it work).

// The address this copy of the app is served from: its sign-in metadata is served there too.
const ORIGIN: `https://${string}` = typeof location !== 'undefined' && HOSTS.includes(location.hostname) ? `https://${location.hostname}` : `https://${HOME}`
export { SCOPE }
export const REDIRECT: `https://${string}` = `${ORIGIN}/atproto-callback`

/** The same object /oauth-client-metadata.json serves here, which the sign-in server reads. */
export const CLIENT_METADATA: OAuthClientMetadataInput = clientMetadata(ORIGIN)

interface AtprotoState {
  did?: string
  handle?: string
  /** A sign-in has been started from here and not finished: the code can be pasted. */
  pending?: boolean
  /** What this sign-in was granted, once known: older sign-ins predate some permissions. */
  scope?: string
  set: (s: Partial<Pick<AtprotoState, 'did' | 'handle' | 'pending' | 'scope'>>) => void
}

export const useAtproto = create<AtprotoState>()(
  persist((set) => ({ set: (s) => set(s) }), { name: 'readout:atproto', version: 1, partialize: ({ did, handle, pending, scope }) => ({ did, handle, pending, scope }) }),
)

/** Whether the sign-in can read the timeline (for Following): undefined until known. */
export const canReadTimeline = (scope: string | undefined) => (scope === undefined ? undefined : scope.includes('rpc:app.bsky.feed.getTimeline'))
/** Whether the sign-in can read notifications (for Activity): undefined until known. */
export const canReadNotifications = (scope: string | undefined) => (scope === undefined ? undefined : scope.includes('rpc:app.bsky.notification.listNotifications'))

const grantedScope = (s: OAuthSession) =>
  s
    .getTokenInfo()
    .then((t) => t.scope as string)
    .catch(() => undefined)

let client: Promise<BrowserOAuthClient> | undefined
/** The OAuth client, loaded only when someone signs in or is signed in. */
function oauth(): Promise<BrowserOAuthClient> {
  client ??= import('@atproto/oauth-client-browser').then(({ BrowserOAuthClient, buildLoopbackClientId }) => {
    // In development the app runs on localhost, which sign-in servers handle as a loopback client.
    const dev = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    return new BrowserOAuthClient({
      clientMetadata: dev ? { client_id: buildLoopbackClientId(location), redirect_uris: [`http://127.0.0.1:${location.port}/atproto-callback`], scope: SCOPE } : CLIENT_METADATA,
      handleResolver: location.origin,
      responseMode: 'fragment',
    })
  })
  return client
}

let current: OAuthSession | undefined

async function profileHandle(did: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`)
    return res.ok ? ((await res.json()) as { handle?: string }).handle : undefined
  } catch {
    return undefined
  }
}

async function adopt(session: OAuthSession) {
  current = session
  const [handle, scope] = await Promise.all([profileHandle(session.did), grantedScope(session)])
  useAtproto.getState().set({ did: session.did, handle: handle ?? session.did, pending: false, scope })
}

/** Starts signing in: off to the account's server, back to /atproto-callback. */
export async function signIn(handle: string) {
  // A copy of PaperWing anywhere else would sign in as PaperWing and finish on paperwing.io: refuse.
  const dev = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  if (!dev && !HOSTS.includes(location.hostname)) throw new Error(`Sign in from https://${HOME}`)
  const c = await oauth()
  useAtproto.getState().set({ pending: true })
  await c.signInRedirect(handle.trim().replace(/^@/, ''), { scope: SCOPE })
}

/** On /atproto-callback: finishes the sign-in if this browser started it. False when it didn't (Safari, from an installed app). */
export async function finishSignIn(): Promise<boolean> {
  const c = await oauth()
  try {
    const params = c.readCallbackParams()
    if (!params) return false
    const { session } = await c.initCallback(params)
    await adopt(session)
    return true
  } catch {
    return false
  }
}

/** The code shown in Safari, pasted back into the installed app. */
export async function finishWithCode(code: string) {
  const c = await oauth()
  const text = code.trim().replace(/^.*?[#?]/, '')
  const { session } = await c.initCallback(new URLSearchParams(text), REDIRECT)
  await adopt(session)
}

/** The signed-in session, restored (and refreshed) as needed. */
export async function session(): Promise<OAuthSession> {
  const did = useAtproto.getState().did
  if (!did) throw new Error('Sign in with Bluesky first (Settings, Sources)')
  if (current?.did === did) return current
  try {
    current = await (await oauth()).restore(did)
    const scope = await grantedScope(current)
    if (scope) useAtproto.getState().set({ scope })
    return current
  } catch (err) {
    // Restoring can need the network (to refresh the tokens). Offline, the client keeps the sign-in
    // for next time, so keep ours too; anything else (revoked, invalid) signs out here as well.
    if (await unreachable(err)) throw new Error('Couldn’t reach Bluesky. Check your connection and try again.')
    useAtproto.getState().set({ did: undefined, handle: undefined, scope: undefined })
    throw new Error('Your Bluesky sign-in has expired. Sign in again in Settings, Sources')
  }
}

/** Whether the browser's fetch itself failed somewhere under this error: no answer came back at all. */
const unreachable = (err: unknown) =>
  import('@atproto/oauth-client-browser').then(
    ({ FetchRequestError }) => {
      // The client wraps a failed fetch in a FetchRequestError with the browser's error as its cause;
      // its own refusals (a forbidden address, say) have no cause. Others may wrap that in turn.
      for (let e = err; e instanceof Error; e = e.cause) if (e instanceof FetchRequestError && e.cause !== undefined) return true
      return false
    },
    () => false,
  )

export async function signOut() {
  const did = useAtproto.getState().did
  useAtproto.getState().set({ did: undefined, handle: undefined, pending: false, scope: undefined })
  if (!did) return
  try {
    await (await oauth()).revoke(did)
  } catch {
    /* already gone */
  }
  current = undefined
}

export interface StrongRef {
  uri: string
  cid: string
}

async function xrpc<T>(nsid: string, body: unknown): Promise<T> {
  const s = await session()
  const res = await s.fetchHandler(`/xrpc/${nsid}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string }
  if (!res.ok) throw new Error(data.message || data.error || `${nsid} failed (${res.status})`)
  return data
}

/** Reads from Bluesky's AppView as the signed-in account, through their own server. */
export async function appview<T>(nsid: string, params: Record<string, string | number | undefined>): Promise<T> {
  const s = await session()
  const scope = useAtproto.getState().scope
  if (scope !== undefined && !scope.includes(`rpc:${nsid}`)) throw new Error('Your Bluesky sign-in predates this feature. Allow it under Settings, Sources.')
  const qs = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])))
  const { usePrefs } = await import('./store')
  const { acceptLabelers } = await import('./moderation')
  const res = await s.fetchHandler(`/xrpc/${nsid}?${qs}`, {
    headers: { 'atproto-proxy': 'did:web:api.bsky.app#bsky_appview', 'atproto-accept-labelers': acceptLabelers(usePrefs.getState().labelers) },
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string }
  // Say what the server said: a guess here hides the real problem.
  if (!res.ok) throw new Error(`Bluesky said no (${res.status}${data.error ? ` ${data.error}` : ''})${data.message ? `: ${data.message}` : ''}`)
  return data
}

/** Whether the sign-in may write this collection: undefined until known. */
export const canWrite = (scope: string | undefined, collection: string) => (scope === undefined ? undefined : scope.includes(`repo:${collection}`))

/** Creates or replaces a record at a key of our choosing (a mix, its feed), in the signed-in account's repo. */
export async function putRecord(collection: string, rkey: string, record: Record<string, unknown>): Promise<StrongRef> {
  if (canWrite(useAtproto.getState().scope, collection) === false) throw new Error('Publishing needs one more permission: allow it under Settings, Sources (Bluesky account).')
  const s = await session()
  return xrpc<StrongRef>('com.atproto.repo.putRecord', { repo: s.did, collection, rkey, record: { $type: collection, ...record } })
}

/** Uploads a picture to your repo (a link card's thumbnail), returning the blob to put in a record. */
export async function uploadBlob(bytes: Blob): Promise<{ $type: 'blob'; ref: { $link: string }; mimeType: string; size: number }> {
  const s = await session()
  const res = await s.fetchHandler('/xrpc/com.atproto.repo.uploadBlob', { method: 'POST', headers: { 'content-type': bytes.type || 'image/jpeg' }, body: bytes })
  const data = (await res.json().catch(() => ({}))) as { blob?: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number }; message?: string }
  if (!res.ok || !data.blob) throw new Error(data.message ?? `Couldn’t upload the picture (${res.status})`)
  return data.blob
}

/** Writes a record to the signed-in account's repo. */
export const createRecord = (collection: string, record: Record<string, unknown>) =>
  session().then((s) => xrpc<StrongRef>('com.atproto.repo.createRecord', { repo: s.did, collection, record: { $type: collection, ...record } }))

/** What PaperWing ever deletes: its own likes, votes, mixes, feeds and submissions. */
const DELETABLE = new Set([
  'app.bsky.feed.like',
  'fyi.frontpage.feed.vote',
  'io.paperwing.mix',
  'app.bsky.feed.generator',
  'io.paperwing.submission',
  'io.paperwing.share',
  'io.paperwing.blogroll',
  'io.paperwing.note',
  'io.paperwing.board',
  'io.paperwing.boardhide',
  'app.bsky.graph.listitem',
])

/** Deletes one of the signed-in account's own records, by its at:// URI. Anything else is refused. */
export async function deleteRecord(uri: string) {
  const [, , repo, collection, rkey] = uri.split('/')
  const s = await session()
  if (repo !== s.did || !DELETABLE.has(collection) || !/^[A-Za-z0-9._~:-]{1,512}$/.test(rkey ?? '')) throw new Error('PaperWing won’t delete that record')
  await xrpc('com.atproto.repo.deleteRecord', { repo, collection, rkey })
}
