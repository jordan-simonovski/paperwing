import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Your Hacker News account, for upvoting and commenting (api/hn.ts). HN's session cookie is kept
// on this device only: never synced, never stored on PaperWing's server. The password isn't kept
// anywhere; it goes to HN once, through PaperWing's server, to sign in.

interface HnState {
  user?: string
  cookie?: string
  /** Items you've upvoted from here, so the arrows show it. */
  votes: Record<string, true>
  set: (s: Partial<Pick<HnState, 'user' | 'cookie' | 'votes'>>) => void
}

export const useHn = create<HnState>()(persist((set) => ({ votes: {}, set: (s) => set(s) }), { name: 'readout:hn', version: 1, partialize: ({ user, cookie, votes }) => ({ user, cookie, votes }) }))

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/hn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (res.status === 401 && body.action !== 'login') useHn.getState().set({ user: undefined, cookie: undefined })
  if (!res.ok) throw new Error(data.error ?? `Hacker News failed (${res.status})`)
  return data
}

/** Submits a link to HN. Through call(), so an expired session signs you out here as a vote does. */
export async function hnSubmit(title: string, url: string): Promise<{ url?: string; existing?: boolean }> {
  const c = useHn.getState().cookie
  if (!c) throw new Error('Sign in to Hacker News first')
  return call<{ url?: string; existing?: boolean }>({ action: 'submit', cookie: c, title, url })
}

export async function hnSignIn(username: string, password: string) {
  const { user, cookie } = await call<{ user: string; cookie: string }>({ action: 'login', username, password })
  useHn.getState().set({ user, cookie, votes: {} })
  return user
}

/** Signs out here and on HN, so the session can't be used again from a copy of it. */
export function hnSignOut() {
  const cookie = useHn.getState().cookie
  useHn.getState().set({ user: undefined, cookie: undefined, votes: {} })
  if (cookie) void fetch('/api/hn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'logout', cookie }) }).catch(() => {})
}

const cookie = () => {
  const c = useHn.getState().cookie
  if (!c) throw new Error('Sign in to Hacker News first (Settings, Sources)')
  return c
}

/** Upvotes an item, or takes the vote back. Shown straight away; undone if HN says no. */
export async function hnVote(id: string): Promise<boolean> {
  const { votes, set } = useHn.getState()
  const up = !votes[id]
  const next = { ...votes }
  if (up) next[id] = true
  else delete next[id]
  set({ votes: next })
  try {
    await call({ action: 'vote', cookie: cookie(), id, how: up ? 'up' : 'un' })
    return up
  } catch (err) {
    set({ votes })
    throw err
  }
}

export async function hnComment(parent: string, text: string) {
  await call({ action: 'comment', cookie: cookie(), parent, text })
}
